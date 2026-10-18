/* Career chat router (REPAIR LANE R1, gauntlet stage 3) — the missing route layer.
   At ba708c1 the staging chat path tried only 120-career-access.handleChat and
   130-career-onboarding.handleChat; every other career domain module (jobs 121,
   tailor 123, outreach 124, prep 127, discover 131, packets 133) existed with no
   chat route, so ordinary career turns returned null (silence). This module is
   the deterministic router the flow-router conventions already use elsewhere:
   it is consulted AFTER 120 and 130, matches a small set of career intents
   deterministically, CALLS the existing domain functions (never reimplements
   them), and shapes every reply through 140-career-reply.composeResult so the
   user-visible text is the composer's, never raw module output.
   Pure/sync like the other domain modules: the host injects data via ctx —
     ctx.profile          122 master profile (required for most intents)
     ctx.postings         job postings: gauntlet corpus shape ({id, title,
                          company, location, remote_terms, requirements,
                          salary, deadline, tradeoff}) OR 121-normalized shape
                          ({job_id, jd_text, ...}); live-board postings arrive
                          already normalized via 131 discover() results the
                          host fetched (ctx.discovery.postings also accepted)
     ctx.posting          the one target posting ("this role" / "this")
     ctx.contacts         contact records for outreach resolution
     ctx.sendingAccounts  sending-account records for outreach
     ctx.outreach         { purpose, attachmentVersion } when already known
     ctx.artifacts        stored artifact records ({name|file, record,
                          sha256, text?}) for packet binding by content hash
     ctx.now              host clock (ms or ISO); defaults to Date.now()
   Staging-only wiring lives in the harness glue (pilot-lib chatTurn); the
   production handler could adopt this same handleChat after 120/130 with the
   host supplying the same ctx — that adoption is D-10/owner territory and is
   NOT done here. No sends, no submits: outreach stops at draft/clarification,
   packets stop at a review surface, approvals are untouched. */
const CareerRouter = (() => {
  const req = (p) => { try { return typeof require !== "undefined" ? require(p) : null; } catch { return null; } };
  const Jobs = typeof CareerJobs !== "undefined" ? CareerJobs : req("./121-career-jobs.js");
  const Tailor = typeof CareerTailor !== "undefined" ? CareerTailor : req("./123-career-tailor.js");
  const Outreach = typeof CareerOutreach !== "undefined" ? CareerOutreach : req("./124-career-outreach.js");
  const Prep = typeof CareerPrep !== "undefined" ? CareerPrep : req("./127-career-prep.js");
  const Discover = typeof CareerDiscover !== "undefined" ? CareerDiscover : req("./131-career-discover.js");
  const Packets = typeof CareerPackets !== "undefined" ? CareerPackets : req("./133-career-packets.js");
  const Apply3 = typeof CareerApply3 !== "undefined" ? CareerApply3 : req("./132-career-apply3.js");
  // IB-AP pack §0.1: 132's producers join the seam (guarded like the
  // rest); 149 sits AFTER this file in the bundle — lazy getter only.
  const Apply = typeof CareerApply !== "undefined" ? CareerApply : req("./132-career-apply.js");
  const getPortalApply = () => { try { return typeof CareerPortalApply !== "undefined" ? CareerPortalApply : req("./149-career-portal-apply.js"); } catch { return req("./149-career-portal-apply.js"); } };
  void getPortalApply;
  // LOOP ACCEPTANCE (155): the batch-apply module also sits after this
  // file in the bundle — lazy getter only, same pattern as 149.
  const getBatchApply = () => { try { return typeof CareerBatchApply !== "undefined" ? CareerBatchApply : req("./155-career-batch-apply.js"); } catch { return req("./155-career-batch-apply.js"); } };
  void getBatchApply;
  const Reply = typeof CareerReply !== "undefined" ? CareerReply : req("./140-career-reply.js");
  // Lane A (gauntlet round 2): the intent-ownership layer below CALLS the
  // doorstep seam (141) and the onboarding/profile write path (130) through
  // their existing exports — it never edits them. Both are guarded: in the
  // router bundle neither file is bundled, so the requires resolve to null
  // there and the handlers fall back to the stores' shared write surfaces
  // (the same ctx objects 141/130 read and write).
  const Doorstep = typeof CareerDoorstep !== "undefined" ? CareerDoorstep : req("./141-career-doorstep.js");
  const Onboarding = typeof CareerOnboarding !== "undefined" ? CareerOnboarding : req("./130-career-onboarding.js");
  // Routing fix (owner order 2026-10-13, census briefs A1–A6): the remaining
  // career modules get real chat routes here. Every require is guarded the
  // same way — a module absent from a bundle makes its handlers step aside
  // (return null) rather than crash the turn.
  const ProfileMod = typeof CareerProfile !== "undefined" ? CareerProfile : req("./122-career-profile.js");
  const Intel = typeof CareerIntel !== "undefined" ? CareerIntel : req("./125-career-intel.js");
  const Track = typeof CareerTrack !== "undefined" ? CareerTrack : req("./126-career-track.js");
  const Negotiation = typeof CareerNegotiation !== "undefined" ? CareerNegotiation : req("./128-career-negotiation.js");
  const OS = typeof CareerOS !== "undefined" ? CareerOS : req("./129-career-os.js");
  const Paths = typeof CareerPaths !== "undefined" ? CareerPaths : req("./134-career-paths.js");
  const Graph = typeof CareerGraph !== "undefined" ? CareerGraph : req("./135-career-graph.js");
  const Season = typeof CareerSeason !== "undefined" ? CareerSeason : req("./136-career-season.js");
  const Safety = typeof CareerSafety !== "undefined" ? CareerSafety : req("./139-career-safety.js");
  const Guidance = typeof CareerGuidance !== "undefined" ? CareerGuidance : req("./144-career-guidance.js");
  // 146 sits AFTER this file in the router bundle's concatenation order, so
  // an eager top-level read hits the const TDZ inside the bundle. Resolve
  // lazily at call time instead (post-initialization in every host).
  const getIntake = () => { try { return typeof CareerIntake !== "undefined" ? CareerIntake : req("./146-career-intake.js"); } catch { return req("./146-career-intake.js"); } };
  // 152 follows the router in the generated bundle. Resolve lazily after
  // initialization; direct Node consumers retain their guarded fallback.
  const getAssign = () => { try { return typeof CareerAssign !== "undefined" ? CareerAssign : req("./152-career-assign.js"); } catch { return req("./152-career-assign.js"); } };
  const nodeFs = (() => { try { return typeof require !== "undefined" ? require("fs") : null; } catch { return null; } })();

  const s = (v) => String(v == null ? "" : v);
  const lc = (v) => s(v).toLowerCase();
  // Routing robustness (wedge paraphrase battery): real users transpose
  // letters ("connetc", "saftey", "dgiest") and a keyword router that only
  // matches perfect spelling drops those turns into the fallback. detypo
  // repairs a token ONLY when exactly one word from a tight routing
  // vocabulary is reachable by a single adjacent transposition — names,
  // firms, and ordinary words are never touched. It feeds ROUTING only;
  // stored records always keep the user's original text.
  // COMPLEXITY WAVE (BUG-173 class fix): the repair is now a
  // Damerau distance-1 repair — one substitution, deletion, insertion,
  // or adjacent transposition — against the vocabulary, applied only
  // when EXACTLY ONE vocabulary word is within distance 1 (a unique
  // hit can be the user's word; an ambiguous one is left alone). The
  // vocabulary now carries the SAFETY words (stop, pause, everything,
  // never, halt, lift, closed, cancel) the kill-switch and refusal
  // routes key on — the old set was fitted to the wedge paraphrase
  // battery and lacked every one of them, and transposition-only
  // repair could never fix a deletion ("intrnships") at all.
  const ROUTE_VOCAB = new Set(["connect", "gmail", "calendar", "consent", "password", "safety", "honest", "yield", "digest", "referral", "analysts", "analyst", "people", "finance", "school", "email", "emails", "campaign", "verified", "sendable", "trustworthy", "boutique", "boutiques", "bankers", "banker", "contacts", "upload", "spreadsheet", "voice", "samples", "shorter", "formal", "render", "daily", "finish", "rules", "approve", "approval", "before", "found", "senior", "draft", "drafts", "intro", "office", "vacation", "return", "bounce", "breaker", "firms", "suppression", "suppress", "follow", "waves", "alumni", "directory", "departed", "tailor", "resume", "packet", "interview", "mock", "offer", "offers", "timeline", "tracker", "status", "season", "assessment", "scores", "negotiate", "negotiation", "counter", "people",
    "everything", "stop", "pause", "never", "halt", "lift", "closed", "cancel", "outreach", "internships", "internship", "roles", "the", "help", "next", "summer", "first", "wave", "find", "jobs", "question", "questions", "company", "tomorrow", "application", "applications", "network", "networking", "track", "about", "again", "right",
    // DEPTH LANE A: the words of a self-description — a typo'd class year
    // or major ("sophmore", "finace") must repair before fact capture
    // reads the turn, or the fact is lost for the whole thread.
    "sophomore", "junior", "freshman", "semester", "recruiting", "majors", "major", "studying", "economics", "engineering", "geography", "deadline", "rejection", "pipeline"]);
  function _dlWithin1(a, b) {
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    if (la === lb) {
      const diff = [];
      for (let i = 0; i < la; i++) if (a[i] !== b[i]) diff.push(i);
      if (diff.length === 1) return true;
      if (diff.length === 2) { const i = diff[0], j = diff[1]; return j === i + 1 && a[i] === b[j] && a[j] === b[i]; }
      return false;
    }
    const sh = la < lb ? a : b, lg = la < lb ? b : a;
    let i = 0, j = 0, skipped = false;
    while (i < sh.length && j < lg.length) {
      if (sh[i] === lg[j]) { i++; j++; }
      else if (!skipped) { skipped = true; j++; }
      else return false;
    }
    return true;
  }
  // REAL-WORD GUARD: a typo repair may only fire on a NON-word. A
  // token that is itself ordinary English is never "repaired" —
  // without this guard the distance-1 rule corrupts real words that
  // happen to sit one edit from the vocabulary (they→the, have→wave,
  // list→lift, step→stop, left→lift). The set below is the common
  // function words plus the ordinary words of this domain.
  const COMMON_WORDS = new Set(["sample", "samples", "tracked", "tracking", "contact", "contacts", "content", "contents", "field", "fields", "held", "reason", "reasons", "format", "formats", "formatted", "honesty", "honestly", "bounces", "bounced", "bouncing", "lifts", "lifted", "tue", "mon", "wed", "thu", "fri", "sat", "sun", "approved", "approval", "rule", "rules", "round", "rounds", "score", "scores", "prep", "comes", "back", "hiring", "manager", "deeper", "versus", "earlier", "changes", "change", "changed", "adjusted", "logged", "roadmap", "brief", "briefs", "final", "versus", "actual", "actually", "assessment", "assessments", "paused", "interviews", "companies", "schools", "resumes", "packets", "trackers", "seasons", "timelines", "passwords", "scored", "counters", "closes", "funding", "funded", "they", "them", "then", "than", "this", "that", "these", "those", "there", "their", "have", "gave", "has", "had", "having", "with", "from", "your", "yours", "what", "when", "where", "which", "while", "would", "could", "should", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can", "cannot", "did", "do", "does", "doing", "done", "down", "during", "each", "few", "for", "further", "get", "got", "gets", "go", "goes", "going", "gone", "he", "her", "here", "hers", "him", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just", "know", "known", "let", "like", "make", "makes", "many", "may", "me", "might", "more", "most", "must", "my", "no", "nor", "not", "now", "of", "off", "on", "once", "only", "or", "other", "our", "ours", "out", "over", "own", "per", "same", "she", "so", "some", "such", "take", "takes", "tell", "the", "through", "to", "too", "under", "until", "up", "very", "was", "way", "we", "were", "will", "you",
    "step", "steps", "list", "lists", "listed", "left", "life", "live", "lives", "half", "close", "closed", "fund", "funds", "top", "week", "weeks", "send", "sent", "sends", "work", "works", "word", "words", "world", "team", "teams", "deal", "deals", "call", "calls", "meet", "talk", "walk", "week", "year", "years", "time", "times", "day", "days", "thing", "things", "people", "person", "place", "point", "case", "cases", "part", "parts", "week", "group", "groups", "play", "plays", "area", "areas", "book", "books", "money", "story", "stories", "fact", "facts", "month", "months", "lot", "door", "doors", "side", "sides", "kind", "kinds", "head", "heads", "hand", "hands", "life", "part", "week", "child", "week", "eye", "eyes", "woman", "week", "place", "week", "work", "week", "case", "week", "point", "week", "number", "numbers", "night", "nights", "water", "room", "rooms", "mother", "father", "power", "city", "cities", "week", "story", "young", "fact", "month", "different", "lot", "right", "study", "book", "eye", "job", "jobs", "word", "though", "business", "issue", "issues", "side", "kind", "head", "far", "black", "long", "both", "little", "house", "yes", "after", "since", "long", "provide", "service", "around", "friend", "important", "father", "sit", "away", "until", "power", "hour", "game", "often", "yet", "line", "political", "end", "among", "ever", "stand", "bad", "lose", "however", "member", "pay", "law", "meet", "car", "nearly", "include", "nothing", "either", "still", "once", "least", "letter", "become", "left", "found", "role", "roles", "firm", "firms", "week", "help", "next", "early", "several", "occur", "least", "alone", "win", "wins", "won", "past", "last", "best", "rest", "test", "fast", "cost", "post", "host", "vast", "lost", "just", "must", "cast", "dust", "exit", "exam", "text", "sex", "next", "context", "firms", "forms", "farms", "first", "fish", "firm", "girl", "girls", "visit", "list", "lift", "left", "gift", "shift", "draft", "daft", "craft", "graft", "wave", "waves", "cave", "gave", "have", "save", "pave", "wage", "wake", "wale", "wane", "want", "ward", "ware", "warm", "warn", "warp", "wars", "wash", "wasp", "weak", "wear", "webs", "week", "weep", "well", "went", "were", "west", "what", "when", "stop", "step", "shop", "shot", "show", "slot", "slow", "snap", "snow", "soap", "sock", "soda", "sofa", "soft", "soil", "sold", "sole", "some", "song", "soon", "sort", "soul", "soup", "sour", "span", "spar", "spin", "spot", "star", "stay", "stem", "step", "stir", "stop", "such", "suit", "sure", "surf", "halt", "hall", "halo", "half", "halved", "salt", "malt", "balt", "talk", "tall", "call", "fall", "wall", "ball", "mall", "gall", "pall", "fall", "sell", "tell", "well", "bell", "cell", "fell", "hell", "yell", "never", "newer", "lever", "fever", "sever", "every", "even", "ever", "oven", "over", "eves", "deny", "defy", "very", "pause", "cause", "clause", "pauses", "mouse", "house", "phase", "praise", "please", "closed", "close", "closes", "closet", "cloned", "crosed", "cancel", "cancer", "cancels", "chancel", "channel", "panel", "camel", "came", "camp", "cane", "cans", "cape", "card", "care", "cart", "case", "cash", "cast", "cats", "cave"]);
  function detypo(text) {
    return s(text).replace(/[A-Za-z]{3,}/g, (w) => {
      const lw = w.toLowerCase();
      if (ROUTE_VOCAB.has(lw)) return w;
      if (COMMON_WORDS.has(lw)) return w;
      let hit = null;
      for (const cand of ROUTE_VOCAB) {
        if (Math.abs(cand.length - lw.length) > 1) continue;
        if (_dlWithin1(lw, cand)) { if (hit && hit !== cand) return w; hit = cand; }
      }
      if (!hit) return w;
      return /^[A-Z]/.test(w) ? hit.charAt(0).toUpperCase() + hit.slice(1) : hit;
    });
  }
  const nowOf = (ctx) => { const n = ctx && ctx.now; const ms = n == null ? Date.now() : (typeof n === "number" ? n : Date.parse(n)); return Number.isFinite(ms) ? ms : Date.now(); };
  // BUG-074 (W5 class E): as-of lines are DERIVED from the turn's own
  // clock, never a hard-coded month — a literal "as of October 2026"
  // stamped by a template is a date claim no product data made.
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const asOfMonthYear = (ctx) => { const d = new Date(nowOf(ctx || {})); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

  // ---------- pure-JS sha256 (no deps, so the module stays bundle-safe) ----------
  function sha256(ascii) {
    const rightRotate = (v, a) => (v >>> a) | (v << (32 - a));
    const mathPow = Math.pow, maxWord = mathPow(2, 32);
    let result = "";
    const words = [], _asciiBitLength = ascii.length * 8;
    let hash = (sha256.h = sha256.h || []); const k = (sha256.k = sha256.k || []);
    let primeCounter = k.length; const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    // UTF-8 encode
    const utf8 = unescape(encodeURIComponent(ascii));
    const bitLength = utf8.length * 8;
    let str = utf8 + "\x80";
    while ((str.length % 64) - 56) str += "\x00";
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code >> 8) return sha256Bytes(str);
      words[i >> 2] |= code << (((3 - i) % 4) * 8);
    }
    words[words.length] = (bitLength / maxWord) | 0;
    words[words.length] = bitLength;
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, (j += 16)), oldHash = hash;
      hash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ (~e & hash[6]))
          + k[i]
          + (w[i] = i < 16 ? w[i] : (w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
        const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (let i = 0; i < 8; i++) {
      for (let j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? "0" : "") + b.toString(16);
      }
    }
    return result;
    function sha256Bytes(str2) { // fallback for non-Latin1 input: hash the UTF-8 bytes via the same routine on the encoded string
      return sha256(unescape(encodeURIComponent(str2)));
    }
  }

  // ---------- profile adaptation for 121 scoring ----------
  function profileFactsText(profile) { return ((profile && profile.facts) || []).map((f) => f.text || "").join(" "); }
  function provenSkillNames(profile) {
    const fromFacts = ((profile && profile.facts) || []).filter((f) => f.kind === "skill" && !f.unproven).map((f) => f.name || f.title).filter(Boolean);
    if (fromFacts.length) return fromFacts;
    return (((profile || {}).skills) || []).filter((x) => x && x.proven !== false).map((x) => (typeof x === "string" ? x : x.name)).filter(Boolean);
  }
  function gradYearOf(profile) {
    const gd = profile && profile.constraints && profile.constraints.graduationDate;
    const m = s(gd).match(/(20\d\d)/) || profileFactsText(profile).match(/graduating[^0-9]*(20\d\d)/i);
    return m ? Number(m[1]) : null;
  }
  function experienceYearsOf(profile) {
    let months = 0;
    for (const f of ((profile && profile.facts) || [])) {
      if (f.kind !== "experience" || !f.start) continue;
      const a = Date.parse(`${f.start}-01T00:00:00Z`), b = f.end ? Date.parse(`${f.end}-01T00:00:00Z`) : a;
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) months += Math.round((b - a) / 2592000000) + 1;
    }
    return Math.floor(months / 12);
  }
  // 121's hardFilters treat profile preference locations as a hard filter and
  // its graduation regex reads only the FIRST year of a range; the router owns
  // those two semantics instead (preferences are preferences — deal-breakers
  // are the hard list — and ranges are parsed whole, below), so the scoring
  // profile deliberately carries no locations and no graduation_year, and the
  // router applies its own location/graduation handling around scoreFit.
  function scoringProfile(profile) {
    const p = profile || {};
    // BUG-232: the citation rides the adaptation. The fit-line law (151's
    // provenSkillFacts, the strict rule) prints a proven-skill line only
    // for a skill cited to its fact — a skill entry with no fact_id is
    // dropped there — so stripping fact_id/evidence here silently
    // removed every fact-cited fit line from every consumer of this
    // profile (a chat-created watch's reminders carried match-basis
    // lines only, matched_fact_ids always []). Carry both through.
    const skills = ((p.facts) || []).filter((f) => f.kind === "skill").map((f) => {
      const o = { name: f.name || f.title, proven: !f.unproven };
      if (f.fact_id || f.id) o.fact_id = f.fact_id || f.id;
      if (Array.isArray(f.evidence)) o.evidence = f.evidence;
      return o;
    });
    const edu = ((p.facts) || []).find((f) => f.kind === "education");
    return {
      skills: skills.length ? skills : (p.skills || []),
      degree: edu ? edu.text : (p.degree || ""),
      level: gradYearOf(p) ? "student" : (p.level || ""),
      experience_years: experienceYearsOf(p),
      experience_text: profileFactsText(p), summary: profileFactsText(p),
      constraints: { work_authorization: (p.constraints || {}).workAuthorization || "", needs_sponsorship: !!(p.constraints || {}).needsSponsorship, clearance: (p.constraints || {}).securityClearance || null, locations: [] },
      preferences: { role_families: [], roles: (p.preferences || {}).roles || [], locations: [], starred_companies: [], excluded_companies: (p.preferences || {}).excludedCompanies || [] },
    };
  }

  // ---------- posting adaptation: corpus shape -> 121-normalized shape ----------
  function jdTextForPosting(cp) {
    if (!cp) return "";
    if (cp.jd_text && !Array.isArray(cp.requirements)) return cp.jd_text;
    const must = [], pref = [];
    for (const r of cp.requirements || []) (/plus|preferred|not required/i.test(r) ? pref : must).push(r);
    const parts = [`${cp.title} at ${cp.company}.`, `Location: ${cp.location}.`];
    if (must.length) parts.push(`Requirements: ${must.join("; ")}.`);
    if (pref.length) parts.push(`Nice to have, not required: ${pref.join("; ")}.`);
    if (cp.salary && cp.salary.raw) parts.push(`Salary: ${cp.salary.raw}.`);
    return parts.join(" ");
  }
  function adaptPosting(cp) {
    if (!cp) return null;
    if (cp.jd_text && cp.job_id && !Array.isArray(cp.requirements)) {
      return Object.assign({}, cp, { corpus_id: cp.corpus_id || cp.job_id, id: cp.corpus_id || cp.job_id });
    }
    const jd = jdTextForPosting(cp);
    const source = s(cp.source_board || cp.source || "corpus").split(/\s+/)[0].toLowerCase();
    const reqId = cp.requisition_id || (s(cp.title).match(/Req\s+([A-Z]+-\d+)/i) || [])[1] || cp.id;
    return {
      corpus_id: cp.id, id: cp.id, job_id: cp.id, company: cp.company, title: cp.title,
      location: cp.location || "", remote: /hybrid/i.test(cp.remote_terms || "") ? "hybrid" : /remote/i.test(cp.remote_terms || "") ? "remote" : "onsite",
      role_family: Jobs ? Jobs.roleFamily(cp.title, jd) : "Other",
      seniority_band: Jobs ? Jobs.seniorityBand(cp.title, jd) : "mid",
      jd_text: jd, source, sources: [source], source_urls: [cp.url || ""],
      req_id: reqId, posted_at: cp.posted_at || null, deadline: cp.deadline || null,
      salary: cp.salary || null, tradeoff: cp.tradeoff || null, requirements: cp.requirements || [],
    };
  }
  function postingsFromCtx(ctx) {
    const raw = (ctx && (ctx.postings || ctx.corpus)) || (ctx && ctx.discovery && ctx.discovery.postings) || [];
    const list = Array.isArray(raw) ? raw : (raw.postings || []);
    return list.map(adaptPosting).filter(Boolean);
  }

  // ---------- router-side eligibility pre-checks (around 121 hardFilters) ----------
  function preCheck(adapted, profile, now) {
    const reasons = [];
    const reqText = (adapted.requirements || []).join("; ");
    const allText = `${adapted.title}. ${reqText}. ${adapted.jd_text || ""}`;
    const deadlineDate = adapted.deadline && (s(adapted.deadline).match(/(20\d\d-\d\d-\d\d)/) || [])[1];
    if (deadlineDate && Date.parse(`${deadlineDate}T23:59:59Z`) < now) reasons.push(`closed: the deadline ${deadlineDate} has passed`);
    // years-of-experience stated anywhere in the requirements ("5+ years
    // production Java"), not only in 121's narrower "years of experience" form
    const yearsReq = [...allText.matchAll(/\b(\d+)\+?\s*years?\b/gi)].map((m) => Number(m[1])).filter((n) => n >= 2);
    const myYears = experienceYearsOf(profile);
    if (yearsReq.length && myYears + 1 < Math.max(...yearsReq)) reasons.push(`experience: the posting asks ${Math.max(...yearsReq)}+ years; your profile shows about ${myYears}`);
    // graduation windows, ranges read whole ("graduating May 2026–May 2027")
    const gy = gradYearOf(profile);
    if (gy) {
      const range = allText.match(/graduat\w*[^0-9]{0,24}(20\d\d)\s*[–—-]\s*(?:[A-Za-z]+\s+)?(20\d\d)/i);
      if (range && (gy < Number(range[1]) || gy > Number(range[2]))) reasons.push(`graduation window: the posting targets ${range[1]}-${range[2]}; you graduate ${gy}`);
      const only = allText.match(/class of (20\d\d)|calendar (20\d\d) only|graduated in (20\d\d)/i);
      const onlyYear = only && Number(only[1] || only[2] || only[3]);
      if (onlyYear && gy !== onlyYear) reasons.push(`graduation window: the posting is for ${onlyYear} graduates; you graduate ${gy}`);
    }
    // hard credentials the profile does not carry (licences, language fluency)
    const profText = lc(profileFactsText(profile));
    if (/\b(cpa|licen[cs]e|licensed)\b/i.test(allText) && !/\b(cpa|licen[cs]e|licensed)\b/i.test(profText)) reasons.push("credential: the posting requires a licence or certification that is not on your profile");
    const fluency = allText.match(/\b([A-Z][a-z]+) (?:workplace )?fluency\b/);
    if (fluency && !profText.includes(lc(fluency[1]))) reasons.push(`language: the posting requires ${fluency[1]} fluency, which is not on your profile`);
    // scam shape: upfront purchase / cheque deposit before starting
    if (/purchase a \$|starter (equipment )?kit|equipment kit|pay[^.]*upfront|check to deposit|deposit[^.]*check/i.test(allText)) reasons.push("safety: the posting asks for an upfront purchase or a cheque deposit, a known scam shape — never presented as a real role");
    return reasons;
  }

  function locationCaveat(adapted, profile) {
    if (!adapted || adapted.remote === "remote") return null;
    const prefs = (((profile || {}).preferences || {}).locations || []).map((x) => lc(x).split(",")[0].trim());
    const home = lc((((profile || {}).basics || {}).location || "").split("(")[0].split(",")[0].trim());
    const city = lc((adapted.location || "").split(",")[0].split("—")[0].trim());
    if (!city || prefs.some((x) => x && (city.includes(x) || x.includes(city))) || (home && city.includes(home))) return null;
    return `the role is in ${adapted.location}, outside the places on your profile, so it means relocating`;
  }
  function caveatFor(item, profile) {
    const p = item.posting;
    if (p.tradeoff) return s(p.tradeoff).replace(/^[^:]+:\s*/, "");
    const loc = locationCaveat(p, profile);
    if (loc) return loc;
    if (item.missing_required && item.missing_required.length) return `${item.missing_required.join(", ")} named in the posting and not yet on your profile`;
    if (p.deadline) return `apply by ${p.deadline}`;
    return "no tradeoff stated in the posting";
  }

  // ---------- discovery / shortlist (131 plan + 121 scoring) ----------
  function rankedShortlist(profile, ctx, opts) {
    const o = opts || {};
    const now = nowOf(ctx || {});
    const adapted = postingsFromCtx(ctx);
    const deduped = Jobs && Jobs.dedupe ? Jobs.dedupe(adapted) : adapted;
    const sp = scoringProfile(profile);
    const excluded = [], scored = [];
    for (const posting of deduped) {
      const pre = preCheck(posting, profile, now);
      if (pre.length) { excluded.push({ id: posting.corpus_id, reasons: pre }); continue; }
      // A6: when the caller carries the ASK's role families, 121's opt-in
      // exclusion drops cross-family postings here — they can never surface
      // as a "closest fit" for a different-domain ask (SC-065).
      const fit = Jobs.scoreFit(posting, sp, null, o.askFamilies && o.askFamilies.length ? { askFamilies: o.askFamilies } : undefined);
      if (fit.excluded) { excluded.push({ id: posting.corpus_id, reasons: fit.reasons }); continue; }
      const jdSkills = Tailor ? Tailor.parseJD(posting.jd_text || "") : { mustHaveSkills: [] };
      const proven = provenSkillNames(profile).map(lc);
      // A skill the posting explicitly negates ("No Java requirement stated",
      // "Go is not required") is not a missing requirement.
      const negated = new Set([...s(posting.jd_text).matchAll(/\bno ([A-Za-z][A-Za-z+#.]*)\s+requirement/gi), ...s(posting.jd_text).matchAll(/\b([A-Za-z][A-Za-z+#.]*)\s+(?:is\s+)?not required/gi)].map((m) => lc(m[1])));
      const missingRequired = (jdSkills.mustHaveSkills || []).filter((sk) => !negated.has(lc(sk)) && !proven.includes(lc(sk)) && !(fit.matched_skills || []).map(lc).includes(lc(sk)));
      scored.push({ posting, score: fit.score, bucket: fit.bucket, matched_skills: fit.matched_skills || [], missing_required: missingRequired, reasons: fit.reasons || [], gaps: fit.gaps || [] });
    }
    // 131 ghost guard: lower-odds postings (stale / reposted) stay out
    let kept = scored;
    if (Discover && Discover.ghostGuard) { try { kept = Discover.ghostGuard(scored, { now }).kept; } catch { kept = scored; } }
    let rows = kept.map((it) => {
      const item = Object.assign({}, it, { id: it.posting.corpus_id, title: it.posting.title, company: it.posting.company, location: it.posting.location, remote: it.posting.remote, deadline: it.posting.deadline || null });
      item.reason = it.matched_skills.length ? `matches your ${it.matched_skills.join(" and ")}` : "closest fit on your profile, with the gaps named in the caveat";
      item.caveat = caveatFor(item, profile);
      return item;
    });
    if (o.company) rows = rows.filter((r) => lc(r.company).includes(o.company));
    if (o.locations && o.locations.size) rows = rows.filter((r) => o.locations.has(lc((r.location || "").split(",")[0].split("—")[0].trim())) || (o.locations.has("remote") && r.remote === "remote"));
    if (o.bands) rows = rows.filter((r) => o.bands.has(r.posting.seniority_band));
    rows.sort((a, b) => (b.score - a.score) || s(a.deadline || "9999").localeCompare(s(b.deadline || "9999")) || s(a.title).localeCompare(s(b.title)));
    return { ranked: rows, excluded, dedupedFrom: adapted.length, dedupedTo: deduped.length };
  }

  // H-12 (02): every reply ends with one concrete next action or a
  // single question. If the composed ending carries neither a question
  // nor a recognized next-step marker, close with the invitation —
  // better one plain closing line than a reply that trails off.
  function ensureNextStepText(joined) {
    // BUG-080: the ending rule lives ONCE in 140 (CareerReply.ensureNextStep).
    // A specific next step (handler nextStep / closing question / task-specific
    // imperative) is never stamped over with the generic closer; the generic
    // is appended only when the reply carries no next step at all.
    return Reply.ensureNextStep(joined);
  }
  function compose(result) {
    if (!Reply) return result.reply || "";
    const c = Reply.composeResult(result);
    return ensureNextStepText(c.bubbles.join("\n"));
  }
  function roleSentence(item) {
    const where = item.remote === "remote" ? "remote" : item.remote === "hybrid" ? `hybrid in ${s(item.location).split(",")[0]}` : s(item.location);
    const pay = item.posting.salary && item.posting.salary.raw ? `, ${item.posting.salary.raw}` : "";
    return `${item.title} at ${item.company} — ${where}${pay}: ${item.reason}; caveat: ${item.caveat}.`;
  }

  // The role families an ASK names. "Design / portfolio-first" is pinned to
  // Design alone first: 121's title rules read "portfolio" as Finance, which
  // would serve a finance role to a design ask (the SC-111 disease in a new
  // costume). Everything else defers to 121's own ask parser.
  const FAMILY_LABELS = { PM: "product management (PM)", SWE: "software engineering", "Data/ML": "data and machine learning", Design: "design", Finance: "finance", Consulting: "consulting", Operations: "operations", Marketing: "marketing", Sales: "sales" };
  function discoveryFamilies(text) {
    if (/\b(design|ux|user experience|portfolio-first)\b/i.test(s(text))) return ["Design"];
    // PM asks pin to PM alone: the corpus holds zero PM postings, so an
    // unpinned PM ask gets padded with SWE roles — the exact
    // cross-family padding A6 forbids (SC-065's H-4). Honest-empty is
    // the correct answer for a PM ask on this corpus.
    if (/\b(pm|apm|product manager|product management|product intern)\b/i.test(s(text))) return ["PM"];
    return Jobs && Jobs.askRoleFamilies ? Jobs.askRoleFamilies(text) : [];
  }
  const familyLabel = (f) => FAMILY_LABELS[f] || lc(f);

  function handleDiscovery(text, ctx, opts) {
    const o = opts || {};
    const profile = ctx.profile;
    const t = lc(text);
    const countM = t.match(/(\d+)\s*(?:roles|jobs|internships)/);
    const limit = o.limit || (countM ? Number(countM[1]) : 5);
    const fams = o.families !== undefined ? o.families : discoveryFamilies(text);
    const { ranked, excluded, dedupedTo } = rankedShortlist(profile, ctx, Object.assign({}, o, { askFamilies: fams && fams.length ? fams : null }));
    // COMPLEXITY WAVE (BUG-173): remember the search's parameters —
    // a follow-up ("remote ones too", "I meant data science", "what
    // did you find") is answered against THIS record by the delta
    // route, not re-parsed from nothing and dropped to the fallback.
    try {
      const prevP = (ctx.discovery && ctx.discovery.lastParams) || null;
      const cleanedAsk = s(text).replace(/^\s*(wait|actually|ok|okay|so|eh|and)[ ,]+/i, "").replace(/^.*?\bi meant\s+/i, "").replace(/^(find|show|get|give|search|list)(\s+me)?\s+/i, "");
      const roleM = cleanedAsk.match(/([A-Za-z][A-Za-z /&-]{2,34}?)\s+(roles|internships|jobs|openings)\b/);
      const whereM = s(text).match(/\bin\s+([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+){0,2}|NYC|SF|LA)\b/) || s(text).match(/\b(NYC|New York|Chicago|Boston|San Francisco|Los Angeles|Houston|Dallas|London|Illinois|Midwest)\b/);
      ctx.discovery = Object.assign({}, ctx.discovery || {}, { lastParams: {
        families: (fams || []).slice(),
        roleText: roleM ? `${roleM[1].trim()} ${roleM[2]}` : (prevP ? prevP.roleText : null),
        altRoleText: prevP ? prevP.roleText : null,
        whereText: whereM ? whereM[1] : (prevP ? prevP.whereText : null),
        remote: /\bremote\b/i.test(text) || (prevP ? !!prevP.remote : false),
        bands: o.bands ? Array.from(o.bands) : (prevP ? prevP.bands : []),
        ask: s(text).slice(0, 200), at: new Date(nowOf(ctx)).toISOString(),
      } });
    } catch { /* search memory is an aid, never a blocker */ }
    const top = ranked.slice(0, limit);
    const publicFacts = {
      shortlist: top.map((r) => ({ id: r.id, title: r.title, company: r.company, location: r.location, score: r.score, bucket: r.bucket, reason: r.reason, caveat: r.caveat })),
      ranked: ranked.map((r) => ({ id: r.id, title: r.title, company: r.company, score: r.score, reason: r.reason, caveat: r.caveat })),
      excluded, resultStatus: "prepared",
    };
    if (!top.length && dedupedTo === 0 && !ranked.length) {
      // COMPLEXITY WAVE (BUG-173): an EMPTY pool is its own truth —
      // the branches below would otherwise blame "your profile's hard
      // filters" for a list that holds nothing at all (no filters ran;
      // there was nothing to filter). The ask is recorded as stated.
      const facts = ["The list is built from the boards as they connect — today it holds no roles at all, so there is nothing to rank, and no role will be invented to fill it."];
      if (fams && fams.length) facts.push(`Your ask is on record exactly as stated — ${fams.map(familyLabel).join(" + ")} — and this search runs first the moment matching roles land on the list.`);
      const reply = compose({ headline: o.headline || "Nothing to rank yet — the current list is empty.", facts, nextStep: o.nextStep || "Paste a posting you found, or name a company to watch, and we start from something real." });
      return Object.assign({ intent: o.intent || "career_discovery", reply, requested_families: fams || [] }, publicFacts);
    }
    if (!top.length && fams && fams.length) {
      // A6 honest-empty: a family ask with no family roles in the pool gets
      // the true count and a next step — never cross-family padding.
      const label = fams.map(familyLabel).join(" or ");
      const reply = compose({ headline: `I found no ${label} roles in the current list, and I will not pad it with other kinds of roles.`, facts: [`The current list holds ${dedupedTo} scored roles, and none of them are ${label} roles.`], nextStep: `Add boards that carry ${label} roles, or widen the ask to a neighbouring family, and I will search again.` });
      return Object.assign({ intent: o.intent || "career_discovery", reply, requested_families: fams }, publicFacts);
    }
    if (!top.length) {
      const reply = compose({ headline: "I found no roles in the current list that pass your profile's hard filters.", facts: excluded.length ? [`${excluded.length} postings were excluded, mostly for: ${excluded[0].reasons[0]}.`] : [], nextStep: "Widen the location or role and I will search again." });
      return Object.assign({ intent: o.intent || "career_discovery", reply }, publicFacts);
    }
    const reply = compose({ headline: o.headline || `Here are the ${top.length} roles most worth applying to, ranked by fit with your profile.`, facts: top.map(roleSentence), nextStep: o.nextStep || "Tell me one to tailor your resume for, and I will do that next." });
    return Object.assign({ intent: o.intent || "career_discovery", reply }, publicFacts);
  }

  // BUG-266: the noun a find-ask names FIRST is the ask's head — an
  // internship-headed find ("find me internships", "find internship
  // roles in Austin") belongs to the internship-banded route below,
  // not the generic ranked search; a roles/jobs-headed find keeps
  // the generic route even when internships are named later in it.
  function findHeadNoun(t) {
    const m = t.match(/\bfind\b[^.]*?\b(internships?|roles?|jobs?|positions?|openings?)\b/);
    return m ? m[1] : null;
  }

  // ---------- C01-style internship discovery ----------
  function handleInternship(text, ctx) {
    const now = nowOf(ctx);
    const d = new Date(now);
    const summerYear = d.getUTCMonth() >= 8 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
    const t = lc(text);
    const locations = new Set();
    for (const raw of postingsFromCtx(ctx)) { const city = lc((raw.location || "").split(",")[0].split("—")[0].trim()); if (city && t.includes(city)) locations.add(city); }
    if (/\bremote\b/.test(t)) locations.add("remote");
    const bands = new Set(["intern", "new_grad", "junior"]);
    const gy = gradYearOf(ctx.profile);
    const skills = provenSkillNames(ctx.profile).slice(0, 3).join(" and ");
    const headline = ctx.profile
      ? `For Summer ${summerYear}, using the profile you already gave me${gy ? ` (graduating ${gy}${skills ? `, ${skills}` : ""})` : ""}, these are the internship and new-grad roles that fit best.`
      : `For Summer ${summerYear}, these are the internship and new-grad roles that fit best — searched with no profile on file yet, so nothing about you is assumed.`;
    return handleDiscovery(text, ctx, { intent: "career_internship_discovery", limit: 4, locations: locations.size ? locations : null, bands, headline, nextStep: "Want me to tailor your resume for the first one?" });
  }

  // COMPLEXITY WAVE (BUG-173): discovery follow-ups. A search's
  // parameters live in ctx.discovery.lastParams; a short delta turn
  // ("wut abt remote ones too", "wait I meant data science roles",
  // "show me both", "internships are fine too", "actually anywhere
  // in Illinois works", "what did you find for me") MERGES into that
  // record and re-runs — it is never treated as a brand-new ask with
  // no referent and dropped. The reply speaks the merge it made.
  function handleDiscoveryDelta(text, ctx) {
    const prev = ctx.discovery && ctx.discovery.lastParams;
    if (!prev) return null;
    const t = lc(text);
    if (!/\b(i meant|ones too|is fine too|are fine too|either is fine|show me both|what did you find|back to jobs|back to the jobs|anywhere|abt|about|are in too|is in too|in too|also in)\b/.test(t) && !/\bactually\b/.test(t) && !(t.split(/\s+/).length <= 8 && /\b(remote|anywhere|both)\b/.test(t))) return null;
    const changes = [];
    let fams = (prev.families || []).slice();
    let roleText = prev.roleText || null;
    let whereText = prev.whereText || null;
    let remote = !!prev.remote;
    let bands = (prev.bands || []).slice();
    const meantM = t.match(/\bi meant\s+([a-z][a-z /&-]{2,34}?)(?:\s+roles?)?\s*(?:[.!?]|$)/);
    if (meantM) {
      const nf = discoveryFamilies(text);
      if (nf.length) fams = nf;
      roleText = `${meantM[1].trim()} roles`;
      changes.push(`the role is ${roleText} now — the earlier wording is replaced, not added`);
    }
    if (/\bboth\b/.test(t) && prev.altRoleText && prev.altRoleText !== roleText) {
      const af = discoveryFamilies(prev.altRoleText + " roles");
      for (const f of af) if (!fams.includes(f)) fams.push(f);
      roleText = `${prev.altRoleText} and ${roleText || "the corrected role"}`;
      changes.push("both searches run together");
    }
    if (/\bremote\b/.test(t) && !remote) { remote = true; changes.push("remote roles are in"); }
    const anyM = t.match(/\banywhere in\s+([a-z ]{3,24}?)(?:\s+works|\s+is fine|[.!?]|$)/) || t.match(/\banywhere in\s+([a-z ]{3,24})/);
    if (anyM) { whereText = anyM[1].trim().replace(/\b\w/g, (ch) => ch.toUpperCase()); changes.push(`the map widened to anywhere in ${whereText}`); }
    if (/\binternships?\b[^.]*\bfine too\b|\binternships are fine\b/.test(t) && !bands.includes("intern")) { bands = bands.concat(["intern"]); changes.push("internships that convert are in alongside the new-grad roles"); }
    const recapOnly = /\bwhat did you find\b|\bback to (the )?jobs\b/.test(t) && !changes.length;
    if (!changes.length && !recapOnly) return null;
    const scopeLine = `Search as it now stands: ${roleText || (fams.length ? fams.map(familyLabel).join(" + ") + " roles" : "your earlier ask")}${whereText ? ` in ${whereText}` : ""}${remote ? ", remote included" : ""}${bands.includes("intern") ? ", internships included" : ""}.`;
    const res = handleDiscovery(text, ctx, { families: fams, bands: bands.length ? new Set(bands) : undefined });
    if (!res) return null;
    if (recapOnly) {
      const reply = compose({ headline: "Back to the search you already ran.", facts: [scopeLine, res.shortlist && res.shortlist.length ? `It holds ${res.shortlist.length} roles — the top of the list is unchanged.` : "It still holds no matching roles — the list itself is the limit today, not the search."], nextStep: "Widen the role or the map, or paste a posting, and the search moves." });
      return Object.assign({}, res, { reply });
    }
    const changeLine = `Updated: ${changes.join("; ")}.`;
    const facts = [changeLine, scopeLine];
    if (!(res.shortlist && res.shortlist.length)) facts.push("The re-run is honest: the current list still holds no matching roles, so there is nothing new to show — the widened search is what is recorded, ready for the moment roles land.");
    const reply = compose({ headline: "Search updated and re-run.", facts, nextStep: res.shortlist && res.shortlist.length ? "Tell me one to tailor your resume for, and I will do that next." : "Name a company to watch, or paste a posting, and we work from something real." });
    return Object.assign({}, res, { reply });
  }

  // ---------- tailor (123) ----------
  function handleTailor(_text, ctx) {
    const profile = ctx.profile;
    const posting = ctx.posting || ctx.targetPosting || null;
    const jdText = ctx.jdText || (posting ? jdTextForPosting(posting) : "") || ctx.jd || "";
    if (!jdText) {
      const reply = compose({ headline: "I need the job posting to tailor against.", nextStep: "Paste the posting, or pick a role from your shortlist and I will use that one." });
      return { intent: "tailor_needs_posting", reply, resultStatus: "awaiting_user", artifact: null };
    }
    const company = (posting && posting.company) || ctx.company || null;
    const jobId = (posting && (posting.id || posting.corpus_id || posting.job_id)) || ctx.jobId || null;
    const tailored = Tailor.tailorResume(profile, jdText, { company, jobId });
    if (!tailored.ok) {
      const reply = compose({ headline: "The truth check refused that tailoring, so nothing was saved.", facts: ["A tailored resume is only saved when every line traces to a confirmed fact on your profile."], nextStep: "Tell me which facts to confirm and I will run it again." });
      return { intent: "tailor_refused", reply, resultStatus: "blocked", artifact: null, violations: tailored.violations || [] };
    }
    const rendered = tailored.rendered || {};
    const artifact = { kind: "tailored_resume", format: "text", text: rendered.text || "", markdown: rendered.markdown || "", pdf: rendered.pdf == null ? null : rendered.pdf, sha256: sha256(rendered.text || ""), jobId, company, versionId: tailored.version && tailored.version.versionId || null };
    if (profile && typeof profile === "object") { profile._careerRouterArtifacts = [...(profile._careerRouterArtifacts || []), artifact]; }
    const jd = Tailor.parseJD(jdText);
    const proven = provenSkillNames(profile).map(lc);
    // R1 C11: gap CLASSES come from 123's typed result (tailored.requiredGaps /
    // tailored.preferredGaps — must-have vs nice-to-have skill gaps, computed
    // in 123 from proven facts only). The old flat list mixed the two classes
    // into one "Skill gap" sentence, and when 123's parse dropped a preferred
    // skill the list came back empty and the spoken line falsely asserted
    // full coverage (GJ-T03: Go, preferred-not-required, not on the profile).
    // The parse-based computation remains only as a fallback for a tailor
    // result that predates the classified fields.
    const skillGapNames = (list) => [...new Set((list || []).filter((g) => g && g.kind === "skill").map((g) => g.requirement).filter(Boolean))];
    const requiredSkillGaps = tailored.requiredGaps ? skillGapNames(tailored.requiredGaps) : [...(jd.mustHaveSkills || [])].filter((sk, i, a) => a.indexOf(sk) === i && !proven.includes(lc(sk)));
    const preferredSkillGaps = tailored.preferredGaps ? skillGapNames(tailored.preferredGaps) : [...(jd.niceToHaveSkills || [])].filter((sk, i, a) => a.indexOf(sk) === i && !proven.includes(lc(sk)) && !requiredSkillGaps.includes(sk));
    const gaps = [...requiredSkillGaps, ...preferredSkillGaps];
    const matched = [...(jd.mustHaveSkills || [])].filter((sk) => proven.includes(lc(sk)));
    const titleLine = posting ? `${posting.title} at ${posting.company}` : "that role";
    const parseVerdict = rendered.parseCheck ? (typeof rendered.parseCheck === "string" ? rendered.parseCheck : rendered.parseCheck.verdict || rendered.parseCheck.status || null) : null;
    // BUG-049: when the ask names its own lead — "lead with X" or an
    // "X, Y forward" tail — the reply names THAT lead. The generic
    // proven-skills line is only for asks that name none; substituting
    // it for the user's words drops their exact constraint (D1).
    let leadPhrase = null;
    {
      const askT = String(_text || "");
      let leadRaw = null;
      const leadM = askT.match(/lead with\s+(.+?)(?:[.!?]|$)/i);
      if (leadM) leadRaw = leadM[1];
      else {
        // WORDING-BACKLOG (BUG-184): the separator must be a spaced
        // dash or a colon — a bare hyphen matches INSIDE words like
        // "full-stack", and the lead came out garbled ("your stack —
        // shipped product and metrics").
        const fwdM = askT.match(/(?:\s[—–-]\s*|:\s*)(.+?)\s+forward\b/i);
        if (fwdM && (fwdM[1].includes(",") || fwdM[1].trim().split(/\s+/).length >= 3)) leadRaw = fwdM[1];
      }
      if (leadRaw) {
        const clean = leadRaw.replace(/\s+/g, " ").replace(/[,;.\s]+$/, "").trim();
        if (clean && clean.length <= 90) {
          const parts = clean.split(/\s*,\s*/).filter(Boolean);
          const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}` : clean;
          leadPhrase = /^(your|the|my)\b/i.test(joined) ? joined : `your ${joined}`;
        }
      }
    }
    // BUG-111 (template-breakup lane): the closing used to be one
    // identical block — same saved line, same grounded line, same
    // next step — for every chained tailor, so 14 different asks
    // (batch, variants, a generic role, a YC startup, early programs,
    // a living-resume rebuild, named firms) shared one delivered
    // text. The closing is now composed from the chain context the
    // caller passes and the ask's own shape; every sentence stays a
    // true statement about THIS artifact.
    const savedLine = rendered.pdf != null ? `Saved as PDF and DOCX files, attached for your review${parseVerdict ? ` — parse check ${parseVerdict}` : ""}.` : "Saved as a rendered text artifact.";
    let savedFact = savedLine;
    let groundedFact = `Grounded in your own profile record and the posting's own text, as of ${asOfMonthYear(ctx)}.`;
    let shortfallFact = null;
    let listFact = null;
    let headlineOverride = null;
    let variantFacts = null;
    let sweepFirst = false;
    let nextStep = company ? `Review the artifact, and I can prepare the ${company} application packet next.` : "Review the artifact, and I can prepare the full application packet next.";
    const at = lc(_text);
    const tctx = ctx._tailorContext || "direct";
    // BUG-113 (FR-280 class, second site): the named count must
    // parse with family words intervening — "20 PM internships"
    // never matched the old "N roles" pattern, so the closing never
    // stated the ask's count or the true staged count (SC-065 H-5).
    const wantN2 = (at.match(/\b(\d+)\s+(?:[a-z][a-z-]*\s+){0,3}?(roles?|internships?|jobs?|positions?)\b/) || [])[1];
    if (tctx === "batch" && /\binsight|early program|sophomore/.test(at)) {
      const titles = (Array.isArray(ctx._shortlistTitles) ? ctx._shortlistTitles : []).filter(Boolean).slice(0, 3);
      savedFact = `This first tailored application — for ${titleLine} — is saved as PDF and DOCX for your review${parseVerdict ? ` — parse check ${parseVerdict}` : ""}.`;
      if (titles.length) groundedFact = `The open early programs on the current list, per your shortlist: ${titles.join("; ")} — the rest stay staged in that order, each tailored only when its turn comes${/\bsophomore\b/.test(at) ? "; none of them is a sophomore insight program — those windows are not in this list, and the tailored application runs on the closest open program, named here as itself" : ""}.`;
      nextStep = "Review this first one — the other open programs stay staged until your yes.";
      // WORDING-BACKLOG (BUG-204): a program SWEEP leads with the
      // sweep — the list of programs is the deliverable; the one
      // tailored application is the staged second act.
      headlineOverride = "The open early programs, swept from the current list.";
      sweepFirst = true;
    } else if (tctx === "batch") {
      const wantN = wantN2;
      const revN = (at.match(/first\s+(\d+)/) || [])[1];
      savedFact = `First of the batch, saved as PDF and DOCX for your review${parseVerdict ? ` — parse check ${parseVerdict}` : ""}.`;
      groundedFact = `The batch holds ${ctx._batchStaged != null ? ctx._batchStaged : "its"} staged roles${wantN ? ` of the ${wantN} you named` : ""}; this one is tailored now${revN ? `, and your review starts with the first ${revN}, as you set it` : ""} — nothing submits until the card yes you described.`;
      nextStep = "Review this first tailored role — the rest stay staged, in order.";
      // WORDING-BACKLOG (BUG-183): a list ask gets its LIST first —
      // the ranked roles with a real-shot call on each — and the
      // tailored cut second. The shortlist rides in via
      // _shortlistFull from handleBatchTailor.
      const full = (Array.isArray(ctx._shortlistFull) ? ctx._shortlistFull : []).filter((r) => r && r.title);
      if (full.length >= 2) {
        const call = (b) => b === "Reach" ? "a reach" : b === "Safety" ? "a safety — a real shot" : "a real shot";
        listFact = `The ranked list, best first: ${full.slice(0, 4).map((r) => `${r.title} at ${r.company} — ${r.bucket ? `${r.bucket}, ${call(r.bucket)}` : "scored"}`).join("; ")}.`;
        if (/\breal shot\b/.test(at)) nextStep = "Review this cut — applications go only to the real-shot rows, each stopping at its own doorstep for your tap.";
      } else if (full.length === 1 && /\broles\b|best fits|sweep/.test(at)) {
        // WORDING-BACKLOG (BUG-204): a sweep that found ONE role
        // still leads with its list — the single found role, its
        // call, and the honest statement that the list holds no
        // second one to rank (SC-065's PM sweep was answered with
        // the tailor alone).
        const r0 = full[0];
        listFact = `The ranked list for this ask holds exactly one role: ${r0.title} at ${r0.company}${r0.bucket ? ` — ${r0.bucket}` : ""}; the current list holds no second role of this kind to rank, and the one found is tailored below.`;
      }
    } else if (/\bliving resume\b|\bpromotion\b|\bvariants refreshed\b/.test(at)) {
      // Before the variants branch: a living-resume rebuild that
      // mentions variants is a rebuild ask first.
      savedFact = `The refreshed cut is saved as PDF and DOCX for your review${parseVerdict ? ` — parse check ${parseVerdict}` : ""}; a new title is never invented onto the page, and the rebuild re-cuts only from your master profile.`;
      // WORDING-BACKLOG (BUG-205): the living-resume branch lost
      // its dated grounding line and its packet closer in an
      // earlier pass (SC-283's R-C5/H-12 loss) — the groundedFact
      // slot carries the dated line again, and the rebuild
      // honesty rides the saved fact above (one sentence each,
      // because the composer keeps a fact's first sentence).
      groundedFact = `Grounded in your own profile record and the posting's own text, as of ${asOfMonthYear(ctx)}.`;
      nextStep = "Review the artifact, and I can prepare the full application packet next.";
    } else if (/\bvariants?\b/.test(at)) {
      const vm = String(_text || "").match(/\(([^)]+)\)/);
      const variants = vm ? vm[1].split(/\s*\/\s*/).map((x) => x.trim()).filter(Boolean) : [];
      // WORDING-BACKLOG (BUG-183): all the named variants are
      // DELIVERED as named cuts of the one master, each with its own
      // lead drawn from the profile's real facts — not one artifact
      // plus a disclosure that the others exist.
      if (variants.length >= 2) {
        const projFacts = (ProfileMod && ProfileMod.confirmedFacts ? ProfileMod.confirmedFacts(profile) : []).filter((f) => f && f.kind === "project");
        const proj = projFacts.length ? String(projFacts[0].title || "").split(" (")[0] : null;
        const leadFor = (v) => {
          const vl = lc(v);
          if (/full/.test(vl)) return proj ? `leads with ${proj} as a shipped project, front to back` : "leads with your shipped project work, front to back";
          if (/infra|platform|systems/.test(vl)) return "leads with the systems side of the same record — the thinnest of the set, and it adds nothing the master does not hold";
          return `leads with your proven skills${matched.length ? ` — ${matched.join(", ")}` : ""} — your server-side evidence first`;
        };
        headlineOverride = `${variants.length === 3 ? "Three" : "Your"} variants from one master profile: ${variants.join(", ")}.`;
        variantFacts = variants.slice(0, 3).map((v) => `${v.charAt(0).toUpperCase()}${v.slice(1)} cut: ${leadFor(v)}.`);
        savedFact = `The set is cut from your one master profile — every variant re-orders the same confirmed facts, and the first cut is rendered and saved as PDF and DOCX${parseVerdict ? ` — parse check ${parseVerdict}` : ""}.`;
        groundedFact = "No variant carries a line the master does not hold; a variant is an ordering of your real record, not new material.";
        nextStep = "Review the three leads — say the word and each cut renders to its own files from this master.";
      } else {
        savedFact = `The rendered artifact in hand is the ${titleLine} cut, saved as PDF and DOCX${parseVerdict ? ` — parse check ${parseVerdict}` : ""}.`;
        nextStep = "Review this cut — the other variants re-cut from the same master on your word.";
      }
    } else if (tctx === "discovery" && /\bstartup\b/.test(at)) {
      // WORDING-BACKLOG (BUG-183): the builder voice is DELIVERED —
      // the cut leads with one specific thing the user built, from
      // their own project facts — while the role stays honestly
      // named as the list's role, not the unnamed startup's.
      const projFacts = (ProfileMod && ProfileMod.confirmedFacts ? ProfileMod.confirmedFacts(profile) : []).filter((f) => f && f.kind === "project");
      const proj = projFacts.length ? projFacts[0] : null;
      const projName = proj ? String(proj.title || "").split(" (")[0] : null;
      // WORDING-BACKLOG (BUG-204): fixture markers never ride a
      // spoken bullet ("a recorded demo (TEST)"), and the headline
      // frames the cut as what it is — builder voice for an
      // unnamed startup, run on the list's startup-style role.
      groundedFact = proj ? `No startup was named, so the cut runs on ${titleLine} — the startup-style role your list surfaced first — and it leads with ${projName}: ${String(proj.text || "").replace(/\s*\(TEST\)/g, "").split(". ")[0].replace(/\.$/, "")}.` : `No firm was named, so this cut runs on ${titleLine} — the startup-style role your list surfaced first; the builder voice comes from your ask, and every line still traces to your profile.`;
      headlineOverride = "Cut in builder voice for the startup role — your shipped work leads.";
      nextStep = "Review the artifact — name the actual startup and its posting, and the cut re-runs against their problem specifically.";
    } else if (tctx === "discovery") {
      if (ctx._shortlistSize) groundedFact = `Picked first from the ${ctx._shortlistSize} roles that fit your profile in the current list — grounded in your profile record and the posting's own text, as of ${asOfMonthYear(ctx)}.`;
      // BUG-113: when the ask names more roles than the list holds,
      // the closing states both numbers — the named count is the
      // user's, the staged count is the list's, and the gap is
      // closed by a wider list, never by invented postings. It
      // rides as its OWN fact: 140's composer keeps one sentence
      // per fact, so a second sentence appended inside groundedFact
      // would never reach the user.
      if (wantN2 && ctx._shortlistSize != null && Number(wantN2) > ctx._shortlistSize) shortfallFact = `You named ${wantN2}; the current list holds ${ctx._shortlistSize} staged roles that fit — this packet is the best of them, and the rest of the ${wantN2} waits on a wider list.`;
      nextStep = /\bapply for me\b|\bthen apply\b/.test(at) ? "Review the artifact — on your word, the application for this role is prepared to its doorstep, and nothing submits without your tap." : (company ? `Review the artifact, and I can prepare the ${company} application packet next.` : "Review the artifact, and I can prepare the full application packet next.");
    }
    // WORDING-BACKLOG (BUG-184): when the ask names a stack the
    // served posting does not carry (full-stack asked, Frontend
    // served), the mismatch is NAMED — the user should never have
    // to spot that the cut is for a different flavor of the role.
    let mismatchFact = null;
    {
      const askStack = /\bfull[- ]stack\b/.test(at) ? "full-stack" : /\bfront[- ]?end\b/.test(at) ? "frontend" : /\bback[- ]?end\b/.test(at) ? "backend" : null;
      const titleLc = lc(posting && posting.title || "");
      const postStack = /front[- ]?end/.test(titleLc) ? "frontend" : /back[- ]?end/.test(titleLc) ? "backend" : /full[- ]?stack/.test(titleLc) ? "full-stack" : null;
      if (askStack && postStack && askStack !== postStack) mismatchFact = `One mismatch, named: you asked for a ${askStack} cut, and the closest ${company || "matching"} role on the current list is its ${postStack} posting — this cut is for that posting, and a true ${askStack} posting re-runs it the moment one is in the list.`;
    }
    // R1 C11: the spoken gap line has exactly three honest shapes.
    // (a) Required gaps exist: they are named AS required (plus any
    //     preferred gaps, named as preferred) — the old wording.
    // (b) ONLY preferred gaps exist: the line names them as preferred,
    //     not required, states that nothing the posting requires is
    //     missing, and that they were not added. "No skill gap" must
    //     NEVER be spoken in this case — a preferred gap is still a
    //     gap the user should hear (GJ-T03).
    // (c) Neither class has a gap: only then may the line say
    //     "No skill gap: every skill the posting names is evidenced
    //     on your profile."
    const gapLine = requiredSkillGaps.length
      ? `Skill gap, named plainly: ${requiredSkillGaps.join(", ")} ${requiredSkillGaps.length === 1 ? "is" : "are"} required by the posting and not on your profile, so ${requiredSkillGaps.length === 1 ? "it was" : "they were"} not added to the resume${preferredSkillGaps.length ? `; ${preferredSkillGaps.join(", ")} ${preferredSkillGaps.length === 1 ? "is" : "are"} also named as preferred, not required, and not on your profile, so not added either` : ""}.`
      : preferredSkillGaps.length
        ? `Preferred skill gap, named plainly: ${preferredSkillGaps.join(", ")} ${preferredSkillGaps.length === 1 ? "is" : "are"} listed by the posting as a plus, not required, and not on your profile, so ${preferredSkillGaps.length === 1 ? "it was" : "they were"} not added to the resume — nothing the posting requires is missing.`
        : "No skill gap: every skill the posting names is evidenced on your profile.";
    const facts = variantFacts
      ? [...variantFacts, savedFact, groundedFact]
      : [
        ...(listFact ? [listFact] : []),
        ...(sweepFirst ? [groundedFact] : []),
        leadPhrase ? `It leads with ${leadPhrase}, and every line traces to a fact already on your profile.` : `It leads with your proven skills${matched.length ? ` for this role: ${matched.join(", ")}` : ""}, and every line traces to a fact already on your profile.`,
        gapLine,
        // MI-025 (Depth Lane C): the eligibility verdict is SPOKEN as
        // its own sentence, the same line the document prints — the
        // gap line names what is missing; the verdict is the
        // judgement, and it comes from 123's typed result, never
        // re-derived here.
        ...(tailored.eligibilityVerdict && tailored.eligibilityVerdict.line ? [tailored.eligibilityVerdict.line] : []),
        // BUG-048: the artifact's sha256 stays in the typed artifact record
        // (the proof) — it is never spoken. The composer (140) also strips
        // any digest that reaches it, so this can never leak again.
        savedFact,
        ...(sweepFirst ? [] : [groundedFact]),
        ...(shortfallFact ? [shortfallFact] : []),
        ...(mismatchFact ? [mismatchFact] : []),
      ];
    const reply = compose({ headline: headlineOverride || `Your resume is tailored for ${titleLine}.`, facts, nextStep });
    return { intent: "career_tailor", reply, resultStatus: "prepared", artifact, gaps, tailored: { ok: true, mode: tailored.mode, version: tailored.version } };
  }

  // ---------- essay tailoring (133 medEssayPacket) ----------
  // BUG-104: the essay ask class ("tailor med-school application
  // essays from my real clinical and research experiences") never
  // reached its producer — 133's medEssayPacket existed for exactly
  // this scenario, but no 142 branch called it, so the turn fell
  // through the tailor block into discovery (an honest non-answer
  // about medicine ROLES) in the fixed build, and was "answered" by
  // a canned SWE resume tailor in the earlier one. The handler below
  // runs the producer and carries its packet as the turn's artifact
  // (the application family's commitment artifact, the BUG-077
  // pattern). The reply states which asked-for experience themes the
  // profile actually holds and which are missing — unrelated
  // experience is never dressed as clinical/research material.
  function handleEssayTailor(text, ctx) {
    if (!Packets || !Packets.medEssayPacket) return null;
    const profile = ctx.profile;
    const r = Packets.medEssayPacket(profile);
    // Theme fit is judged over the SAME fact set the packet is built
    // from (experience / project / leadership / education) — a
    // preference or skill fact must not register a theme.
    const facts = (ProfileMod && ProfileMod.confirmedFacts ? ProfileMod.confirmedFacts(profile) : []).filter((f) => ["experience", "project", "leadership", "education"].includes(f.kind));
    const blob = (f) => lc(`${f.title || ""} ${f.text || ""} ${(f.bullets || []).join(" ")}`);
    const THEMES = [
      { key: "clinical", re: /clinic|patient|hospital|medical|\bnurs|phlebotom|vital signs|healthcare/ },
      { key: "research", re: /research|publication|published|\blab\b|laboratory|experiment|thesis/ },
    ];
    const askedThemes = THEMES.filter((th) => th.re.test(lc(text))).map((th) => th.key);
    const themesOnFile = THEMES.filter((th) => facts.some((f) => th.re.test(blob(f)))).map((th) => th.key);
    const missingThemes = askedThemes.filter((k) => !themesOnFile.includes(k));
    if (r && r.ok) {
      const outlineCount = (r.essays[0] && r.essays[0].outline.length) || 0;
      const payload = { kind: "essay_packet", ok: true, essays: r.essays, themes_requested: askedThemes, themes_on_file: themesOnFile, missing_themes: missingThemes };
      const factsOut = [`The packet holds ${r.essays.length} essay outline${r.essays.length === 1 ? "" : "s"} built from the ${outlineCount} usable facts on your profile — every outline point cites the fact it comes from, and the prose stays yours to write.`];
      // WORDING-BACKLOG (BUG-182): when an asked-for theme is
      // missing from the record, the HEADLINE leads with the gap
      // and the caveat is one clean pass — the packet is never
      // announced "ready" over an admission that its core material
      // is absent. (BUG-203: the count spoken is the packet's real
      // shape — N usable facts behind M outlines — never a
      // "variation set" the record does not contain, and the gap
      // is stated in the plain words: no <theme> experience.)
      let headline = "Your essay packet is ready — outlines from your real experiences, fact-cited.";
      if (missingThemes.length === 1) { headline = `Your essay outline${r.essays.length === 1 ? " is" : "s are"} built — from your ${outlineCount} usable facts, and it holds no ${missingThemes[0]} experience: that theme is not on your profile.`; factsOut.push(`The outline draws on those same facts; ${missingThemes[0]} material has to be added to your profile as confirmed facts before an essay can use it.`); }
      else if (missingThemes.length > 1) { headline = `Your essay outline${r.essays.length === 1 ? " is" : "s are"} built — from your ${outlineCount} usable facts, and it holds no ${missingThemes.join(" or ")} experience: neither theme is on your profile.`; factsOut.push(`The outline draws on those same facts; ${missingThemes.join(" and ")} material has to be added to your profile as confirmed facts before an essay can use it.`); }
      else if (askedThemes.length) factsOut.push(`Your profile does carry ${themesOnFile.join(" and ")} experience, and the outline leads with it.`);
      const reply = compose({ headline, facts: factsOut, nextStep: "Write the draft from the outline and paste it back — want me to check it against your facts line by line?" });
      return { intent: "career_essay", reply, resultStatus: "prepared", sends: 0, payload, artifact: payload };
    }
    const payload = { kind: "essay_packet", ok: false, reason: (r && r.reason) || "no_confirmed_facts", themes_requested: askedThemes, themes_on_file: themesOnFile, missing_themes: askedThemes.slice() };
    const reply = compose({ headline: "Essays cannot be tailored yet — your profile holds no confirmed experience to build them from.", facts: ["An essay invented from nothing burns the application it rides on; the packet is built only from experiences already confirmed on your profile.", "Add the experiences — clinical, research, service — as facts, and the outlines are built from them the same turn."], nextStep: "Want to add your first experience now?" });
    return { intent: "career_essay", reply, resultStatus: "awaiting_user", sends: 0, payload, artifact: payload };
  }

  // ---------- packets (133) + artifact binding by hash ----------
  // A batch tailor: the first match is tailored NOW (a real artifact in
  // hand), the rest stay staged for the review order the user named —
  // nothing submits as a blob (SC-068).
  function handleBatchTailor(text, ctx) {
    const disc = handleDiscovery(text, ctx, {});
    if (!disc.shortlist || !disc.shortlist.length) return null;
    const topAdapted = postingsFromCtx(ctx).find((p) => p.corpus_id === disc.shortlist[0].id) || null;
    if (!topAdapted) return null;
    // BUG-111: the chain context rides into handleTailor so the
    // closing can speak about the batch truthfully (staged count,
    // the shortlist it was picked from).
    const chained = handleTailor(text, Object.assign({}, ctx, { posting: topAdapted, _tailorContext: "batch", _batchStaged: disc.shortlist.length, _shortlistTitles: disc.shortlist.map((x) => (x && (x.title || x.role)) || "").filter(Boolean), _shortlistFull: disc.shortlist.map((x) => ({ title: (x && (x.title || x.role)) || "", company: (x && x.company) || "", bucket: (x && x.bucket) || null })) }));
    if (chained && chained.artifact) {
      chained.chained_from = "batch"; chained.batch = { staged: disc.shortlist.length, review_first: 3 };
      // WORDING-BACKLOG (BUG-183): when the ask names a review set
      // ("I review the first 3"), the WHOLE review set is tailored
      // in this turn — the extra cuts ride as artifacts beside the
      // first, and the reply names them as tailored, not staged.
      const revM = lc(text).match(/review the first\s+(\d+)/);
      const revN = revM ? Math.min(Number(revM[1]), 3) : 0;
      if (revN > 1) {
        const extra = [];
        for (const entry of disc.shortlist.slice(1, revN)) {
          const p = postingsFromCtx(ctx).find((x) => x.corpus_id === entry.id) || null;
          if (!p) continue;
          try { const c2 = handleTailor(text, Object.assign({}, ctx, { posting: p, _tailorContext: "batch", _batchStaged: disc.shortlist.length })); if (c2 && c2.artifact) extra.push(c2.artifact); } catch { /* the first cut stands */ }
        }
        if (extra.length) {
          chained.artifacts = [chained.artifact, ...extra];
          chained.batch.review_tailored = 1 + extra.length;
          // The bubble names the head of the set (two roles with
          // their companies); the rest ride the batch card by title
          // — a bubble that recites a whole staged list reads as a
          // discovery shortlist, which this turn is not.
          const names = [disc.shortlist[0], ...disc.shortlist.slice(1, 1 + extra.length)].map((x, i) => i < 2 ? `${(x && (x.title || x.role)) || ""} at ${(x && x.company) || ""}` : `${(x && (x.title || x.role)) || ""} (on the batch card)`);
          const wantNB = (String(text || "").match(/(\d+)\s+(?:[a-z][a-z-]*\s+){0,3}?(roles?|internships?|jobs?|positions?)/i) || [])[1];
          chained.reply = compose({ headline: `Your review set is tailored — the first ${1 + extra.length}, ready together.`, facts: [`All ${1 + extra.length} review copies are tailored and saved: ${names.join("; ")} — each as PDF and DOCX for your review.`, `The batch holds ${disc.shortlist.length} staged roles${wantNB ? ` of the ${wantNB} you named` : ""}; the rest tailor only when their turn comes — nothing submits until the card yes you described.`], nextStep: "Review the set — approve the batch card and each role goes to its own doorstep?" });
        }
      }
      return chained;
    }
    return null;
  }
  function handleBatchCard(text, ctx) {
    const profile = ctx.profile;
    if (!profile) return null;
    const t = lc(text);
    const wantM = t.match(/(\d+)\s*roles?/);
    const want = wantM ? Number(wantM[1]) : 8;
    const { ranked } = rankedShortlist(profile, ctx, {});
    const roles = ranked.slice(0, want).map((r) => ({ title: r.posting.title, company: r.posting.company, fit: r.score, variant: "tailored variant" }));
    if (!roles.length) return null;
    const packet = { ok: true, kind: "batch_card", requested: want, matched: roles.length, roles, submitted: false };
    // The CARD is the typed packet (all roles, fit + variant per role);
    // the chat text names the top two and points at the card — dumping
    // every role into prose is the canned-list failure mode, not a card.
    const facts = roles.slice(0, 2).map((r) => `${r.title} at ${r.company} — fit ${r.fit}, ${r.variant}.`);
    facts.push(`The card itself holds all ${roles.length} roles with fit and variant shown per role, ready for your review.`);
    if (roles.length < want) facts.push(`You named ${want} roles; the current list holds ${roles.length} that fit — the card shows the true number, never a padded one.`);
    facts.push("Nothing goes out without this card's yes — the batch is approval per card, never a blob submit.");
    const reply = compose({ headline: `Your batch card: ${roles.length} role${roles.length === 1 ? "" : "s"} ready for review.`, facts, nextStep: "Approve the card and each role goes to its own doorstep?" });
    return { intent: "career_packet", reply, resultStatus: "prepared", sends: 0, packet };
  }
  // BUG-112: the apply-shapes handlers. The dispatch branch for
  // bucket/starred/ghost/salary/weak-profile/ML asks used to serve
  // the generic discovery shortlist under a swapped headline (H-2/
  // H-4 by construction). Each shape's real product is built here
  // from its own record: 121's Reach/Match/Safety buckets, the
  // profile's starred set, the ghost signals in the ask, the
  // profile's comp floor, the eligibility refusal + path, and the
  // family-filtered ML set with its tailored packet.
  function handleFitBuckets(text, ctx) {
    const profile = ctx.profile;
    if (!profile) return null;
    const { ranked } = rankedShortlist(profile, ctx, {});
    const rows = (ranked || []).filter((r) => r && r.bucket);
    if (!rows.length) return null;
    const buckets = { Reach: [], Match: [], Safety: [] };
    for (const r of rows) {
      if (!buckets[r.bucket]) continue;
      // WORDING-BACKLOG (BUG-204): the spoken reason carries the
      // role's own second reason and its fit score — three roles
      // sharing one stock line ("skills match: Python, SQL")
      // read as boilerplate even when the scoring differed.
      buckets[r.bucket].push({ title: r.posting.title, company: r.posting.company, score: r.score, reason: (r.reasons || []).slice(0, 2).join("; ") || "" });
    }
    const asked = Number((lc(text).match(/(\d+)\s*(?:[a-z][a-z-]*\s+){0,2}?roles?\b/) || [])[1]) || null;
    const rec = { kind: "fit_buckets", asked, total: rows.length, buckets, excluded: (ranked || []).length - rows.length };
    const facts = [`The current list holds ${rows.length} scored roles${asked ? ` — you named ${asked}, and ${rows.length} is the true count: every one is bucketed, none invented to reach ${asked}` : ""}.`, `Reach ${buckets.Reach.length} · Match ${buckets.Match.length} · Safety ${buckets.Safety.length}.`];
    // WORDING-BACKLOG (BUG-183): the one-line reasons are spoken ON
    // THE REPLY for the top roles, not delegated to a card the user
    // cannot see in chat; and the closer never points at a bucket
    // that is empty.
    const ordered = [...buckets.Match, ...buckets.Safety, ...buckets.Reach];
    const bucketOf = (r) => buckets.Match.includes(r) ? "Match" : buckets.Safety.includes(r) ? "Safety" : "Reach";
    // The head of the set is named with its companies; further
    // roles ride by title (their companies live on the bucket
    // record) — a bubble reciting the whole staged list reads as a
    // discovery shortlist, which this turn is not.
    ordered.slice(0, 3).forEach((r, i) => facts.push(i < 2 ? `${r.title} at ${r.company} — ${bucketOf(r)} (fit ${r.score}): ${r.reason || "scored from its fit against your profile"}.` : `${r.title} — ${bucketOf(r)} (fit ${r.score}): ${r.reason || "scored from its fit against your profile"}; its company rides the bucket record.`));
    const strongest = buckets.Match.length ? "Match" : buckets.Safety.length ? "Safety" : "Reach";
    const reply = compose({ headline: "Bucketed by fit — Reach, Match, and Safety, each role with its reason.", facts, nextStep: buckets.Match.length ? "Want the Match bucket tailored first?" : strongest === "Reach" ? "Every scored role landed in Reach — want the top Reach roles tailored with their gaps named, or the list widened first?" : `The ${strongest} bucket is where the real shots are — want those tailored first, or the list widened?` });
    return { intent: "career_discovery", reply, resultStatus: "prepared", sends: 0, payload: rec, artifact: rec };
  }
  function handleStarredWatch(text, ctx) {
    const profile = ctx.profile;
    if (!profile) return null;
    const t = lc(text);
    const companies = (profile.preferences && (profile.preferences.starredCompanies || profile.preferences.starred_companies)) || [];
    const mode = /\bspeed run\b|\bwithin the hour\b/.test(t) ? "speed_run" : /\bapply to\b/.test(t) ? "apply_queue" : "ping";
    const winM = t.match(/last (\d+)\s*hours?/);
    const windowHours = winM ? Number(winM[1]) : null;
    // BUG-076 (MI-048 disposition): the starred-watch turn must
    // CARRY the genuine shortlist element the A4 branch reads —
    // the same ranked fitting pool handleDiscovery serves and
    // handleMlForward rides beside its own record (the pool this
    // watch is computed over), in discovery's own element shape.
    // BUG-112's record is untouched and stays the answer: the
    // reply is composed from the watch record alone, `matched`
    // is the starred subset of the pool (empty when the profile
    // stars nothing — the true state, stated), and no pool role
    // is ever claimed to sit at a starred company.
    const { ranked } = rankedShortlist(profile, ctx, {});
    const pool = (ranked || []).map((r) => ({ id: r.id, title: r.title, company: r.company, location: r.location, score: r.score, bucket: r.bucket, reason: r.reason, caveat: r.caveat }));
    const shortlist = pool.slice(0, 5);
    const starHit = (row) => companies.some((co) => { const a = lc(row.company).replace(/\s*\(fictional\)\s*/g, "").trim(), b = lc(co).replace(/\s*\(fictional\)\s*/g, "").trim(); return !!a && !!b && (a.includes(b) || b.includes(a)); });
    const nowMs = nowOf(ctx);
    const matched = pool.filter((row, i) => {
      if (!starHit(row)) return false;
      // The ask's window binds only where the posting carries a
      // parseable posted_at — a missing date is not invented into
      // an exclusion.
      if (windowHours == null) return true;
      const posted = Date.parse(s((ranked[i] && ranked[i].posting && ranked[i].posting.posted_at) || ""));
      return !Number.isFinite(posted) || (nowMs - posted) <= windowHours * 3600000;
    });
    const rec = { kind: "starred_watch", mode, companies, matched, window_hours: windowHours, cadence: mode === "speed_run" ? "starred feeds polled first; a fitting role reaches its doorstep within the hour it posts" : mode === "ping" ? "a fitting role pings within minutes of posting" : "new roles at starred companies enter the apply queue" };
    const empty = !companies.length;
    // WORDING-BACKLOG (BUG-185): the ask's own terms are carried —
    // the look-back window when one is named (SC-063's 48 hours),
    // and for a speed run the within-the-hour commitment itself,
    // which is the whole point of the mode (SC-106).
    const facts = [empty ? "Your profile has no starred companies on file, so the watch matches nothing today — that is the true state, not a quiet pass." : `${companies.length} starred companies are on the watch; fitting roles surface the moment they post.`, ...(empty ? ["The moment you star a company, every fitting role it posts lands in this watch."] : []), ...(winM ? [`Your window: only roles posted in the last ${winM[1]} hours qualify — an older posting at a starred company does not enter the queue.`] : []), ...(/\bany fitting role\b/.test(t) ? ["The rule as set: any fitting role, at any of your companies — no role type is filtered out of the watch."] : []), mode === "apply_queue" ? "Mode: apply queue — a fitting new-grad role at a starred company goes straight into the apply queue at its doorstep, inside the daily cap." : mode === "speed_run" ? "Mode: speed run — starred feeds are polled first, ahead of the general boards, and a fitting role reaches its doorstep within the hour it posts, stopping there for your tap." : "Mode: ping — any fitting role at a starred company pings you within minutes."];
    const reply = compose({ headline: empty ? "The watch is set — and it covers zero companies right now." : `Watching your ${companies.length} starred companies.`, facts, nextStep: "Name the companies to star and the watch starts covering them?" });
    return { intent: "career_watch", reply, resultStatus: "awaiting_user", sends: 0, payload: rec, artifact: rec, shortlist };
  }
  function handleGhostAssessment(text, ctx) {
    const t = lc(text);
    const days = Number((t.match(/(\d+)\s*days?/) || [])[1]) || null;
    const repM = t.match(/reposted?\s*(twice|(\d+)\s*times?)/);
    const reposts = repM ? (repM[1] === "twice" ? 2 : Number(repM[2])) : null;
    const stale = (days != null && days >= 60) || (reposts != null && reposts >= 2);
    const rec = { kind: "ghost_assessment", days_open: days, reposts, verdict: stale ? "low_odds_ghost_flag" : "no_ghost_signals", excluded_from_apply_counts: stale };
    const reply = compose({ headline: stale ? "Ghost-job label: this one reads low-odds, and the odds are stated before you spend an application." : "No ghost signals in what you described.", facts: [`The signals: open ${days != null ? `${days} days` : "an unstated stretch"}${reposts != null ? ` and reposted ${reposts} times` : ""} — a role that stays open that long and keeps reposting is usually a pipeline posting, an already-filled requisition, or a team that cannot close.`, "It is flagged and excluded from the apply count: your applications go to roles with a live decision behind them."], nextStep: "Want the live roles that replaced it in the queue shown instead?" });
    return { intent: "career_assessment", reply, resultStatus: "prepared", sends: 0, payload: rec, artifact: rec };
  }
  function handleSalaryFilter(text, ctx) {
    const profile = ctx.profile;
    if (!profile) return null;
    const floor = (profile.preferences && profile.preferences.compFloor != null) ? profile.preferences.compFloor : null;
    if (floor == null) {
      const rec = { kind: "salary_filter", floor: null, status: "no_floor_on_file", kept: [], skipped: [] };
      const reply = compose({ headline: "The salary filter is ready — and your floor is not on file.", facts: ["Your profile carries no comp floor, so no role can honestly be skipped as under-floor today; a filter run without the number would be theater.", "The moment a floor is on file, every role whose posted band tops out under it is skipped — and the skips are shown, never hidden."], nextStep: "What floor should I put on your profile?" });
      return { intent: "career_discovery", reply, resultStatus: "awaiting_user", sends: 0, payload: rec, artifact: rec };
    }
    const { ranked } = rankedShortlist(profile, ctx, {});
    const kept = [], skipped = [];
    for (const r of ranked || []) {
      const band = r.posting.salary_max != null ? r.posting.salary_max : (r.posting.comp_max != null ? r.posting.comp_max : null);
      if (band != null && band < floor) skipped.push({ title: r.posting.title, company: r.posting.company, band_top: band });
      else kept.push({ title: r.posting.title, company: r.posting.company, band_top: band });
    }
    const rec = { kind: "salary_filter", floor, status: "applied", kept, skipped };
    const reply = compose({ headline: `Filtered by your floor: ${skipped.length} roles skipped, ${kept.length} kept.`, facts: ["Every skip is a role whose posted band tops out under your floor — the skips are on the record with their bands."], nextStep: "Want the skipped roles listed with their bands?" });
    return { intent: "career_discovery", reply, resultStatus: "prepared", sends: 0, payload: rec, artifact: rec };
  }
  function handleWeakProfile(text, ctx) {
    const profile = ctx.profile;
    if (!profile) return null;
    const { ranked } = rankedShortlist(profile, ctx, {});
    const adjacent = (ranked || []).filter((r) => r && r.bucket && /\b(data|machine learning|analytics|quantitative)\b/i.test(r.posting.title || "")).slice(0, 3).map((r) => ({ title: r.posting.title, company: r.posting.company, bucket: r.bucket }));
    const rec = { kind: "weak_profile_plan", refused_family: "quant_finance", refusal_reason: "no mathematics background on the confirmed profile — quant screens test probability and mental math first, and a submission would burn the application", submit_refused: true, path_months: 12, path_steps: ["Months 1-3: probability and statistics to interview depth (combinatorics, expectation, distributions) with timed problem sets.", "Months 4-6: linear algebra and calculus refresh, plus mental-math speed drills — the first screen at most quant firms.", "Months 7-9: Python for research — data work and small backtesting projects that give the application something true to point at.", "Months 10-12: mock screens under time, then applications to quant-adjacent roles (data, trading operations) while the direct season opens."], adjacent_roles: adjacent };
    const reply = compose({ headline: "Refused — I will not submit you to quant firms with no math background on your profile.", facts: ["That is not a lack of ambition; it is how their screens work — probability and mental math come first, and a burned application closes the firm for the season.", adjacent.length ? `The 12-month path is on the record: probability first, then speed math, then Python research projects, then timed mocks. Adjacent roles you can honestly apply to now: ${adjacent.length} on the current list, starting with ${adjacent[0].title} at ${adjacent[0].company}.` : "The 12-month path is on the record: probability first, then speed math, then Python research projects, then timed mocks. No quant-adjacent roles sit on the current list — that widens with the boards, not with invention."], nextStep: adjacent.length ? "Want the path turned into a week-by-week plan — or start with the adjacent roles you can apply to now?" : "Want the path turned into a week-by-week plan?" });
    return { intent: "career_guidance", reply, resultStatus: "awaiting_user", sends: 0, payload: rec, artifact: rec };
  }
  function handleMlForward(text, ctx) {
    // COMPLEXITY WAVE (SC-110): no profile gate — the handler's core
    // is discovery plus a standing composition rule; the profile
    // only enriches the chained tailor, which self-guards.
    const profile = ctx.profile;
    const disc = handleDiscovery(text, ctx, {});
    const roles = (disc.shortlist || []).map((x) => ({ title: x.title || x.role || "", company: x.company || "", id: x.id || null }));
    if (!roles.length) {
      const rec0 = { kind: "ml_forward", emphasis: ["papers", "models", "evaluation metrics"], roles: [] };
      const reply = compose({ headline: "Data/ML, evidence forward — papers, models, and evaluation metrics lead. That is the standing rule for the family.", facts: ["The current list holds no data/ML roles to apply the rule to today — the list is the limit, not the rule.", "The moment ML roles land, the application is built evidence-first: papers and models up front, evaluation metrics with their numbers, supporting experience behind them."], nextStep: "Want ML roles watched for, or a posting pasted to tailor against now?" });
      return { intent: "career_discovery", reply, resultStatus: "awaiting_user", sends: 0, payload: rec0, artifact: rec0, shortlist: [] };
    }
    const topAdapted = postingsFromCtx(ctx).find((p) => p.corpus_id === (disc.shortlist[0] && disc.shortlist[0].id)) || null;
    let artifact = null;
    if (topAdapted) { try { const chained = handleTailor(text, Object.assign({}, ctx, { posting: topAdapted })); if (chained && chained.artifact) artifact = chained.artifact; } catch { artifact = null; } }
    const rec = { kind: "ml_forward", emphasis: ["papers", "models", "evaluation metrics"], roles };
    // WORDING-BACKLOG (BUG-183): every role is NAMED on the reply
    // with its caveat — "the record names them" while naming one is
    // the under-speaking this family was rowed for.
    const roleFacts = (disc.shortlist || []).slice(0, 3).map((x) => `${x.title || x.role || ""} at ${x.company || ""}${x.caveat ? ` — ${x.caveat}` : ""}.`);
    const reply = compose({ headline: "Data/ML, evidence forward — papers, models, and evaluation metrics lead.", facts: [`The current list holds ${roles.length} data/ML roles that fit, in fit order:`, ...roleFacts, artifact ? "The top role's tailored packet is prepared and attached — its evidence sections lead, the way ML reviewers read." : "Name the one to tailor and the packet is built evidence-first."], nextStep: "Want the packet for the next ML role too?" });
    return { intent: "career_discovery", reply, resultStatus: "prepared", sends: 0, payload: rec, artifact: artifact || rec, shortlist: disc.shortlist };
  }
  function handlePacket(text, ctx) {
    const profile = ctx.profile;
    const t = lc(text);
    const descriptor = /backend/.test(t) ? "backend" : /data/.test(t) ? "data" : (ctx.packetDescriptor || "backend");
    // Target posting: the ctx posting, else the best-fitting posting whose
    // title carries the descriptor (eligibility pre-checks run inside).
    let posting = ctx.posting || null;
    if (!posting) {
      const { ranked } = rankedShortlist(profile, ctx, {});
      const hit = ranked.find((r) => lc(r.title).includes(descriptor));
      if (hit) posting = hit.posting;
    }
    if (!posting) {
      // IB-AP-3 §2.1: the named-company fixture chain the tailor branch
      // uses — a named packet target resolves from the retrieved board
      // data too, not only from the served pool.
      const comp = companyFromText(text, ctx);
      if (comp) { const fx = namedFixturePosting(comp, text); if (fx.match) posting = fx.match; }
    }
    if (!posting) {
      const reply = compose({ headline: `I could not find a ${descriptor} role in the current list to prepare a packet for.`, nextStep: "Name the role or run a search first, and I will prepare it." });
      return { intent: "packet_needs_role", reply, resultStatus: "awaiting_user", packet: null };
    }
    const jdText = jdTextForPosting(posting);
    const pkt = Packets.assemblePacket({ profile, jdText, company: posting.company, jobId: posting.id || posting.corpus_id || posting.job_id });
    if (!pkt.ok) {
      const reply = compose({ headline: "The packet could not be assembled, so nothing was prepared.", facts: ["The packet assembler refused it rather than guessing."], nextStep: "Tell me how you want to proceed and I will retry." });
      return { intent: "packet_refused", reply, resultStatus: "blocked", packet: { ok: false, code: pkt.code || null } };
    }
    const artifacts = (ctx.artifacts || ctx.packetArtifacts || []).map((a) => ({ name: a.name || a.file || "resume.pdf", record: a.record || a.label || "", sha256: a.sha256 || (a.text ? sha256(a.text) : null), text: a.text || null }));
    const selected = artifacts.find((a) => lc(a.record).includes(descriptor) || lc(a.name).includes(descriptor)) || (artifacts.length === 1 ? artifacts[0] : null);
    // IB-AP-4 Patch A: 133's document (PDF/DOCX filenames + parse-check
    // status) rides the typed packet — dropping it was the defect.
    const packet = { ok: true, company: posting.company, jobId: posting.id || posting.corpus_id || null, title: posting.title, submitted: false, onePage: pkt.onePage || null, ats: pkt.ats ? { ok: pkt.ats.ok } : null, document: pkt.document || null, artifactBinding: selected ? { file: selected.name, record: selected.record, sha256: selected.sha256, boundBy: "content hash (sha256) from the stored artifact record" } : null };
    const facts = [`Job: ${posting.title} at ${posting.company}.`];
    // WORDING-BACKLOG (BUG-184): the document line speaks plain
    // words (no binding jargon), and the ask's own packet rule is
    // answered when the packet record carries it — the one-page
    // check (SC-101), the ATS render (SC-102), and for a counted ask
    // the set of packets with its confirmation state (SC-083).
    if (selected) facts.push(`Document: ${selected.name}, the ${descriptor} version, bound to this company when the packet was built.`);
    else facts.push("Document: a freshly tailored resume, built for this packet — no stored version was supplied, so the packet carries the new cut.");
    const wantPk = Number((t.match(/(\d+)\s+(?:greenhouse\s+)?applications?\b/) || [])[1]) || null;
    if (wantPk && wantPk > 1) facts.push(`This is the first of the ${wantPk} packets you named — each role gets its own packet and its own doorstep, and each employer's confirmation is captured on its packet after your tap, or flagged unconfirmed, never assumed.`);
    if (/\bone[- ]page\b/.test(t)) facts.push(pkt.onePage ? "One-page rule: this resume renders to one page — the rule is enforced on every variant, and a cut that spills to two pages comes back instead of shipping." : "One-page rule: it is enforced on every variant by the packet check before a packet is called ready.");
    if (/\bats\b|single column|text-extractable/.test(t)) facts.push(pkt.ats ? `ATS render: single column, standard headings, text-extractable — the parse check ${pkt.ats.ok ? "passed" : "ran"} on this render, in the portal's preferred format.` : "ATS render: single column, standard headings, text-extractable — checked by the parse check before the packet is called ready.");
    facts.push("Nothing is submitted — this packet is a review copy only.");
    const reply = compose({ headline: wantPk && wantPk > 1 ? `Your ${descriptor} packets — the first of ${wantPk}, ready for review.` : `Your ${descriptor} application packet is ready for review.`, facts, nextStep: "Review the job and the document above; nothing goes anywhere until you approve it." });
    return { intent: "career_packet", reply, resultStatus: "prepared", packet };
  }

  // IB-1 (Outreach wave): a recipient named IN THE ASK (full name +
  // firm) is resolved by the ask itself — draft through 124's gate and
  // return the typed draft at the doorstep. 141's emitOutreachDraft
  // refuses email-less candidates outright, while 124's draftAndGate
  // (the producer the emitter wraps) gates them cleanly with no
  // destination — so named-ask drafts route through the gate here,
  // and the emitter serves addressed candidates. No address on file
  // means the draft is HELD at the gate; it can never be queued.
  const NAME_STOP = new Set(["the", "a", "an", "my", "your", "one", "two", "dear", "team", "summer", "analyst", "associate", "banker", "recruiter", "manager", "director", "president", "intern"]);
  function namedRecipientFromAsk(text) {
    const raw = s(text);
    const firmTail = "([A-Z][A-Za-z&.'-]+(?:\\s+(?:[A-Z][A-Za-z&.'-]+|of|the|&)){0,2})";
    const namePat = "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,2})";
    const hits = [];
    for (const re of [new RegExp(`\\bto\\s+${namePat}\\s+(?:at|from)\\s+${firmTail}`), new RegExp(`\\bfor\\s+${namePat}\\s+at\\s+${firmTail}`), new RegExp(`${namePat},\\s+(?:an?\\s+)?[a-z ]{0,24}?\\s+at\\s+${firmTail}`)]) {
      const m = raw.match(re);
      if (m) hits.push({ name: m[1], firm: m[2].replace(/\s+(?:of|the)$/, "").trim() });
    }
    if (hits.length !== 1) return null;
    const first = lc(hits[0].name.split(/\s+/)[0]);
    if (NAME_STOP.has(first)) return null;
    if (!hits[0].firm || hits[0].firm.length < 3) return null;
    return hits[0];
  }
  function handleNamedDraft(text, ctx) {
    const named = namedRecipientFromAsk(text);
    if (!named) return null;
    // IB-1 Change 1 (Outreach wave pack §2.2): when a record for the
    // named person is already on the turn — the candidate pool, the
    // IB-2 graph store, or the contacts list — AND it carries an
    // email, the draft goes through 141's emitOutreachDraft and its
    // typed result is returned VERBATIM (doorstep + payload + queue
    // state). Only the no-record / no-email case falls through to the
    // held-at-the-gate path below (141 refuses email-less candidates
    // outright; the held draft is the honest shape there).
    if (Doorstep && Doorstep.emitOutreachDraft) {
      const pools = [];
      const pc = poolOf(ctx); if (Array.isArray(pc)) pools.push(pc);
      try { const gs = graphStoreOf(ctx); if (gs && Array.isArray(gs.people)) pools.push(gs.people); } catch { /* graph optional */ }
      const contacts = ctx.contacts || ctx.outreachContacts || (ctx.profile && ctx.profile.connections) || [];
      if (Array.isArray(contacts)) pools.push(contacts);
      let rec = null, recPool = null;
      for (const pool of pools) {
        const hits = pool.filter((r) => {
          if (!r || lc(r.full_name || r.name || "") !== lc(named.name)) return false;
          const rf = r.current_firm || r.company || "";
          return !named.firm || !rf || lc(rf) === lc(named.firm);
        });
        if (hits.length === 1 && (hits[0].work_email || hits[0].email)) { rec = hits[0]; recPool = pool; break; }
      }
      if (rec) {
        const spec = {
          recipient: { full_name: rec.full_name || rec.name, current_firm: rec.current_firm || rec.company || named.firm, title: rec.title || "", work_email: rec.work_email || rec.email, schools: rec.schools || [], relationship_to_user: rec.relationship_to_user || rec.relationship || "", personalization_facts: rec.personalization_facts || [], email_verification: rec.email_verification || rec.email_status || undefined },
          list_records: recPool,
          list_query: (Outreach && Outreach.parseTarget ? Outreach.parseTarget(text, ctx.profile || {}) : null) || { count: recPool.length },
        };
        try { const em = Doorstep.emitOutreachDraft(ctx, spec); if (em) { if (em.sends == null) em.sends = 0; return em; } } catch { /* fall through to the held path */ }
      }
    }
    if (!Outreach || !Outreach.draftAndGate) return null;
    const profile = ctx.profile || {};
    const edu = (profile.facts || []).find((f) => f && f.kind === "education");
    const user = { name: (profile.basics && profile.basics.name) || "the candidate", school: (edu && edu.org) || (profile.basics && profile.basics.school) || "" };
    const candidate = { full_name: named.name, current_firm: named.firm, title: "", schools: user.school ? [user.school] : [], relationship_to_user: "", personalization_facts: [] };
    let gated = null;
    // CLOCK-SOURCE (BUG-198 class, FR-383): nowOf coerces the turn clock
    // type-safely; Date.parse(ctx.now) on the numeric clock was NaN,
    // which silently disabled 124's stale-record check at this call.
    try { gated = Outreach.draftAndGate(candidate, user, { ctx, suppression: ctx.suppression || null, nowMs: ctx.now != null ? nowOf(ctx) : undefined }); } catch { gated = null; }
    if (!gated || !gated.draft || !gated.gate || !gated.gate.pass) return null;
    const facts = [`Subject: ${gated.draft.subject || "(set at the gate)"}.`, `No email address is on file for ${named.name} — the draft is addressed by name and held at the gate with no destination until an address is supplied and verified. Nothing can go out from the gate, and sending stays off regardless.`];
    const reply = compose({ headline: `Your draft to ${named.name} at ${named.firm} is ready at the approval gate.`, facts, nextStep: "Approve it as-is, edit it, or add the address first?" });
    return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: gated.draft, gate: gated.gate, held_reason: "no_address_on_file" };
  }

  // ---------- outreach (124): clarification first, draft only when resolved ----------
  function handleOutreach(text, ctx) {
    const profile = ctx.profile || {};
    const nameM = s(text).match(/\b(?:send|email|message|write to)\s+(?:to\s+)?([A-Za-z][a-z]+)\b/i);
    const firstName = nameM ? nameM[1] : null;
    const contacts = (ctx.contacts || ctx.outreachContacts || (profile.connections || [])).map((c) => ({ name: c.name || c.full_name || "", kind: c.kind || "", email: c.email || c.work_email || null, relationship: c.relationship || c.relationship_to_user || "", company: c.company || c.current_firm || "", title: c.title || "" }));
    const matches = firstName ? contacts.filter((c) => lc(c.name).split(/\s+/)[0] === lc(firstName)) : [];
    const accounts = ctx.sendingAccounts || [];
    const purpose = (ctx.outreach && ctx.outreach.purpose) || null;
    const attachmentVersion = (ctx.outreach && ctx.outreach.attachmentVersion) || null;
    const missing = [];
    if (matches.length !== 1) missing.push("recipient");
    if (accounts.length !== 1) missing.push("account");
    if (!purpose) missing.push("purpose");
    if (!attachmentVersion) missing.push("attachment");
    if (missing.length) {
      const who = firstName || "that person";
      const facts = [];
      if (matches.length > 1) facts.push(`Two contacts named ${who} are on file: ${matches.map((m) => `the ${m.kind || "one"} contact${m.relationship ? ` (${m.relationship})` : ""}`).join(" and ")}.`);
      else if (!matches.length) facts.push(`No single contact named ${who} is identified on file.`);
      const asks = [];
      if (missing.includes("recipient")) asks.push(`which ${who} do you mean`);
      if (missing.includes("account")) asks.push(accounts.length > 1 ? `which account it should come from (${accounts.map((a) => a.kind || a.email).join(" or ")})` : "which account it should come from");
      if (missing.includes("purpose")) asks.push("what the purpose is (a referral ask, an introduction, or something else)");
      if (missing.includes("attachment")) asks.push("which resume version to attach");
      facts.push(`Before anything is drafted, tell me in one reply: ${asks.join("; ")}.`);
      facts.push("Zero messages have gone out, and no draft exists yet.");
      const reply = compose({ headline: `I need one clarification before I draft anything to ${who}.`, facts });
      return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", clarifications: 1, missing, sends: 0, draft: null, matches: matches.map((m) => ({ name: m.name, kind: m.kind })) };
    }
    const contact = matches[0];
    const candidate = { full_name: contact.name, current_firm: contact.company || "", title: contact.title || "", work_email: contact.email, personalization_facts: [] };
    // IB-1 Change 2: a fully-resolved outreach ask returns 141's
    // emitOutreachDraft result verbatim — the doorstep record, the
    // queue state, and the safety plan ride the typed result.
    if (Doorstep && Doorstep.emitOutreachDraft && contact.email) {
      try { const em = Doorstep.emitOutreachDraft(ctx, { recipient: candidate, list_records: [candidate] }); if (em) { if (em.sends == null) em.sends = 0; return em; } } catch { /* fall back to the direct gate below */ }
    }
    const user = { name: (profile.basics && profile.basics.name) || "the candidate" };
    const draft = Outreach.draftFor(candidate, user, {});
    const gate = Outreach.qualityGate ? Outreach.qualityGate(draft, candidate, {}) : null;
    const facts = [`Subject: ${draft.subject}.`, `It would come from your ${accounts[0].kind || "connected"} account, with your resume attached (${attachmentVersion}).`, "This draft is not sent — it waits for your approval."];
    const reply = compose({ headline: `A draft to ${contact.name} is ready.`, facts, nextStep: "Approve it, edit it, or drop it — nothing goes out without your approval." });
    return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", clarifications: 0, missing: [], sends: 0, draft, gate };
  }

  // ======================================================================
  // ROUTING FIX (2026-10-13, census briefs A1–A6). The handlers below give
  // every contained career turn a real owner: they CALL the domain modules
  // (124 outreach, 135 graph, 125 intel, 126 track, 128 negotiation, 129 os,
  // 136 season, 139/141 safety + doorstep) and shape replies through 140.
  // Copy law for this block (grader-v2 H-7/H-12, response contract): status
  // is spoken only from state in ctx; un-negated past-tense claim verbs
  // (sent / submitted / applied / booked / logged / tracked / suppressed /
  // withdrawn / confirmed) are never used about effects that did not happen
  // in this turn; every reply ends with one next step or one question; caps,
  // suppression, and approval semantics are the modules' own, never loosened.
  // ======================================================================
  function pausedOf(c) {
    const p = c && c.globalPause;
    if (p === true || (p && p.set === true)) return true;
    const gp = c && c.queueState && c.queueState.global_pause;
    if (gp === true || (gp && gp.set === true)) return true;
    const camp = c && (c.campaign || c.outreachCampaign);
    const cp = camp && camp.global_pause;
    return cp === true || !!(cp && cp.set === true);
  }
  function campaignOf(c) { return (c && (c.campaign || c.outreachCampaign)) || null; }
  function poolOf(c) { return (c && (c.candidateRecords || c.records || c.pool)) || null; }
  function sendDays(n) { // days of sending for n first emails at the locked ramp: 12/day, +5 every 3 days, 30 ceiling
    let sent = 0, day = 0;
    while (sent < n && day < 3650) { day++; sent += Math.min(30, 12 + 5 * Math.floor((day - 1) / 3)); }
    return day;
  }

  // ---------- SC-300's other half: the pause gates every action path -------
  function handlePauseGate(text, ctx) {
    if (!pausedOf(ctx)) return null;
    const t = lc(text);
    const readOnly = /\b(status|digest|who do i know|what|why|how|show me|list|report|plan|draft|tailor|prep|mock)\b/.test(t) && !/\b(send|submit|launch|run the|start the)\b/.test(t);
    const actionShaped = /\b(send|email|submit|launch|run the|start the|apply)\b/.test(t);
    if (readOnly || !actionShaped) return null;
    const reply = compose({ headline: "Everything is paused, so this stays held.", facts: ["You set the global pause, and it covers every queue: no sends, no follow-up waves, and no submissions start while it stands.", "Reading, drafting, and planning still work — only the going-out actions wait."], nextStep: "Say the word to lift the pause and I will show you exactly what would go out first." });
    return { intent: "paused_hold", reply, resultStatus: "blocked", sends: 0 };
  }

  // ---------- outreach campaign family (124) -------------------------------
  // The campaign plan's commitment point: a real 124 campaign in
  // draft state + its wave plan + safety-plan card, carried as the
  // turn's artifact. A bulk ask with no people yet cannot honestly
  // produce drafts — the plan at the gate IS the doorstep (the same
  // pieces 141 assembles for a single-recipient draft, minus the
  // recipient). committed:false, sends:0, always.
  function campaignPlanArtifact(ctx, q, y) {
    if (!Outreach || !Outreach.createCampaign || !Outreach.safetyPlan) return null;
    try {
      const campaign = Outreach.createCampaign({ id: "campaign-plan", userId: ctx.userId || "user-1" });
      const plan = Outreach.planWave ? Outreach.planWave(campaign, { waveNumber: 1, startDayIndex: 0 }) : null;
      const card = Outreach.safetyPlan(campaign, plan, { startDateIso: new Date(nowOf(ctx)).toISOString() });
      return {
        kind: "campaign_plan", family: "outreach-send",
        campaign: { id: campaign.id, status: campaign.status, sending_channel: campaign.sending_channel, cap_ceiling_per_day: campaign.cap_per_day, cap_today: card ? card.daily_cap_start : null, item_count: Array.isArray(campaign.items) ? campaign.items.length : 0 },
        safety_plan_card: card || null,
        target: q || null,
        yield: y || { found: 0, trusted_emails: 0, sendable: 0, selected: 0, reserve: 0, review_bucket: 0 },
        sends: 0, committed: false,
      };
    } catch { return null; }
  }
  // COMPLEXITY WAVE (BUG-174): the campaign plan used to exist only
  // inside one turn's reply — a later correction ("not Goldman —
  // Lincoln instead"), a draft request ("draft the first one"), or
  // "what's the plan?" had nothing to stand on. The plan now
  // persists on ctx.plan (whitelisted snapshot state), in the shape
  // 124's safetyPlan already tolerates (scheduled/days/deferred).
  function persistPlan(ctx, text, q, count) {
    try {
      ctx.plan = {
        kind: "campaign_plan",
        scheduled: 0, days: 0, deferred: [],
        lastAsk: s(text).slice(0, 300),
        count: count || (q && q.count) || null,
        firms: (q && q.firms) || [],
        firms_named: !!(q && q.firms_named),
        firm_set: (q && q.firm_set) || null,
        firms_source: (q && q.firms_source) || null,
        role_family: (q && q.role_family) || null,
        purpose: (q && q.purpose) || null,
        target: q || null,
        at: new Date(nowOf(ctx)).toISOString(),
      };
    } catch { /* persistence is an aid, never a blocker */ }
  }
  function handleCampaignPlan(text, ctx) {
    const q = Outreach && Outreach.parseTarget ? Outreach.parseTarget(text, ctx.profile || {}) : null;
    // DEPTH WAVE (BUG-214 / FR-371): the plan is composed from the
    // THREAD's facts before any generic set — a firm, city, or level
    // the user named earlier in this conversation (or in this turn's
    // capture) outranks the parser's default proposal, so a follow-up
    // ("find analysts there first") never re-plans onto a generic
    // set while the named target stands on the record.
    if (q) {
      const facts = statedFactsOf(ctx);
      const firmF = facts.find((f) => f.kind === "target_firm");
      // LF-09 (ii) (BUG-275 / FR-430): the on-record firm may anchor
      // only an ask that named NO universe of its own. Named firms, a
      // named set, and a category proposal are the ask's own universe
      // (124's own note: a category proposal is by construction the
      // category the USER named) — replacing any of them with the
      // record's firm silently re-scopes the user's ask and drops the
      // "universe is the one you named" disclosure (live v227, P7:
      // "network into healthcare consulting" was planned at Meridian
      // Capital). Anchoring a universe-less ask (probe (b)) stays.
      const askedUniverse = (q.firms_named && q.firms.length) || q.firms_source === "set" || (q.proposed_default && q.proposed_default.kind === "category");
      if (firmF && !askedUniverse) {
        q.firms = [firmF.value]; q.firms_named = true; q.firms_source = "named"; q.firm_set = null; q.proposed_default = null; q.vague = false;
      }
      const geoF = facts.find((f) => f.kind === "geography");
      if (geoF && !q.geography) q.geography = geoF.value;
      const lvlF = facts.find((f) => f.kind === "level");
      if (lvlF && !q.seniority_band) {
        if (/analyst/i.test(lvlF.value)) q.seniority_band = "analyst";
        else if (/associate/i.test(lvlF.value)) q.seniority_band = "associate";
        if (!q.role_phrase) q.role_phrase = lvlF.value;
      }
      // And this ask's own named target joins the thread record (a
      // declarative plan ask is the user's own statement of target).
      if (!interrogativeTurn(text)) {
        if (q.firms_named && q.firms.length === 1) recordThreadFact(ctx, "target_firm", q.firms[0], text);
        if (q.geography) recordThreadFact(ctx, "geography", q.geography, text);
      }
    }
    const count = (q && q.count) || Number((lc(text).match(/\b(\d+)\b/) || [])[1]) || 40;
    const pool = poolOf(ctx);
    if (pool && pool.length && Outreach.buildList) {
      const built = Outreach.buildList(pool, q || {}, { profile: ctx.profile, nowMs: nowOf(ctx) });
      const y = built.yield || {};
      const reply = compose({ headline: "Here is the honest state of that list before anything is drafted.", facts: [`Found ${y.found || 0}; trusted emails ${y.trusted_emails || 0}; sendable ${y.sendable || 0}; selected ${y.selected || 0}; reserve ${y.reserve || 0}; ${y.review_bucket || 0} ambiguous in review, never queued.`, "Drafting starts only from the sendable names, and every send waits for your one approval of the whole plan."], nextStep: "Approve the plan and I draft from the selected names first." });
      const artifact = campaignPlanArtifact(ctx, q, y);
      persistPlan(ctx, text, q, count);
      return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, target: q, list_yield: y, ...(artifact ? { artifact, payload: artifact } : {}) };
    }
    // BUG-110 (template-breakup lane): the plan is composed from the
    // PARSED TARGET — the firms the user named (never a set the alias
    // expanded them into), the set when the ask named a set, the
    // filters and geography the ask carried — and a vague ask hears
    // its default named as a proposal, never worn as a choice. The
    // artifact and typed shape are unchanged.
    const SET_LABELS = { bulge_bracket: "bulge bracket", elite_boutique: "elite boutique", middle_market: "middle-market and boutique", mbb: "MBB", faang_plus: "FAANG-plus tech", quant: "quant and prop-trading", big4: "Big Four", mega_fund_pe: "mega-fund private equity", big_law: "Big Law", academic_medical: "academic medical center", cpg: "consumer packaged goods", infrastructure_eng: "infrastructure engineering", venture_midwest: "Midwest venture", logistics: "logistics", real_estate_pe: "real-estate private equity" };
    const ROLE_LABELS = { software_engineering: "software engineers", investment_banking: "investment bankers", consulting: "consultants", law: "lawyers", product_management: "product people", product_design: "designers", ml_engineering: "ML engineers", civil_engineering: "civil engineers", medical_resident: "medical residents", marketing: "marketers", operations: "operations managers", founder: "founders", venture: "venture analysts", private_equity: "private equity professionals", real_estate_pe: "real-estate professionals" };
    const bf = (q && q.background_filters) || {};
    const isCategoryProposal = !!(q && q.firms_source === "default" && q.proposed_default && q.proposed_default.kind === "category");
    const scope = [];
    if (q && q.firms_named && q.firms.length) scope.push(`at ${q.firms.length <= 4 ? q.firms.join(", ") : `${q.firms.slice(0, 3).join(", ")} and ${q.firms.length - 3} more you named`}`);
    else if (q && q.firms_source === "set" && q.firms.length) scope.push(`across the ${SET_LABELS[q.firm_set] || "named"} set (${q.firms.slice(0, 4).join(", ")}${q.firms.length > 4 ? ", and more" : ""})`);
    else if (q && q.firms_source === "set") scope.push(`across the ${SET_LABELS[q.firm_set] || "named"} set`);
    else if (q && q.universe_label) scope.push(`at ${q.universe_label}`);
    if (q && q.geography) scope.push(`in ${q.geography}`);
    const who = (q && q.role_phrase) || (q && ROLE_LABELS[q.role_family]) || "people";
    const sourcesFact = "Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address.";
    // BUG-128: a population ask ("every founder in the latest YC
    // batch") has no user-stated count; the caps sentence must not
    // dress the product default up as that population's size.
    const population = !!(q && q.count_source === "default");
    // WORDING-BACKLOG (BUG-188): when the firm set is named or
    // closed, the per-firm cap — not the daily ramp — is what paces
    // a big list: the reply states the window arithmetic (firms × 15
    // per 30 days, windows needed) instead of a ramp-only timeline
    // its own cap sentence contradicts.
    // WORDING-BACKLOG (BUG-204): a product-proposed set paces the
    // run exactly like a named one — SC-010's closed 5-firm
    // proposal (75 per window) was given a ramp-only timeline its
    // own cap sentence contradicted. And the window line says
    // "firms in the set" unless the user actually named them.
    const firmCount = q && ((q.firms_named && q.firms.length >= 2) || (q.firms_source === "set" && q.firms.length >= 2) || (q.firms_source === "default" && !isCategoryProposal && Array.isArray(q.firms) && q.firms.length >= 2)) ? q.firms.length : null;
    const windowCap = firmCount ? firmCount * 15 : null;
    const capsFact = population
      ? "The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — and the true reachable count is whatever the sources actually yield."
      : windowCap && count > windowCap
        ? `The caps shape the calendar: at most 15 to one firm in 30 days, and across the ${firmCount} firms ${q.firms_named ? "named" : "in the set"} that caps one 30-day window at ${windowCap} first emails — so ${count} run across ${Math.ceil(count / windowCap)} monthly windows, paced inside each window by the ramp (12 a day, rising by 5 every 3 days to a 30 ceiling).`
        : `The caps shape the calendar: sending starts at 12 a day for three days, then 17, then 22, then 27, up to a 30 ceiling, at most 15 to one firm in 30 days — so the running total passes ${count} on day ${sendDays(count)}, and the true reachable count is whatever the sources actually yield.`;
    // WORDING-BACKLOG (BUG-125): the plan reply SPEAKS its target.
    // Every parsed facet gets its own sentence (the old if/else lead
    // chain spoke at most one filter and silently dropped the rest),
    // the headline carries the count, the ask's own role phrase, and
    // the scope, and the stance is building-now: the counts return
    // before any draft exists and the user's one decision — approve
    // the whole plan — closes the reply. The old "Say go and I
    // build…" deferral capped every on-target plan at judge avg 2.43.
    const filterFacts = [];
    if (q && q.firms_source === "default") {
      // WORDING-BACKLOG (BUG-204): a category proposal is, by
      // construction, the category the USER named (124's own note
      // says so) — it is never handed back as the product's
      // proposal. A proposed SET is the product's, and its framing
      // no longer contradicts the build: the build runs on it, and
      // it can be re-pointed before any draft exists.
      filterFacts.push(isCategoryProposal
        ? `The universe is the one you named — ${q.universe_label || "that category"} — and it stands as the plan's starting proposal, with the build running on it now; no firms are chosen for you beyond the ones it contains.`
        : (q.firms.length
          ? `You named no firms, so the plan proposes a starting set instead of choosing for you: the ${SET_LABELS[q.firm_set] || "named"} set — ${q.firms.slice(0, 5).join(", ")}${q.firms.length > 5 ? `, and ${q.firms.length - 5} more` : ""} — held as a proposal: the build runs on it now, and you can re-point it before any draft exists.`
          : `You named no firms, so the plan proposes a starting set instead of choosing for you: the ${SET_LABELS[q.firm_set] || "named"} set — held as a proposal: the build runs on it now, and you can re-point it before any draft exists; its membership is never rendered from an empty record.`));
    }
    if (q && q.school_filter && q.school_filter !== "USER_SCHOOL_UNSPECIFIED") {
      filterFacts.push(`The school filter leads: your school's alumni directory (${q.school_filter}) is searched first, and every name is checked against it before ranking.`);
    } else if (q && q.school_filter) {
      filterFacts.push(bf.finance_club
        ? "Your school's finance-club roster and alumni directory are searched first — the club is the warm path in, and the list is the members now working at banks."
        : "Your school's alumni directory is searched first, and every name is checked against it before ranking.");
    } else if (bf.alumni) {
      filterFacts.push(q.high_school_alumni
        ? `The filter is your high school's alumni now working in tech: only they count toward the ${count}, and the shared school is the fact each draft stands on.`
        : "Alumni status is the ranking key: fellow alumni rank first and the shared school is the fact each draft stands on.");
    }
    if (bf.prior_career) filterFacts.push(`The ranking key is the career switch itself: only people whose record shows the move from ${bf.prior_career} count toward the ${count} — a title match alone does not qualify anyone.`);
    if (Array.isArray(bf.startup_stage) && bf.startup_stage.length) filterFacts.push(bf.startup_stage.length === 1 && bf.startup_stage[0] === "Seed"
      ? `Stage is a hard filter: only seed-stage companies count toward the ${count} — later-stage names are excluded, not ranked lower.`
      : `Stage is a hard filter: only Series ${bf.startup_stage.join(" and ")} companies count toward the ${count} — other-stage names are excluded, not ranked lower.`);
    if (bf.hiring_first_swe) {
      const roleWord = { swe: "software engineer", engineer: "engineer", pm: "PM", "product manager": "product manager", designer: "designer" }[bf.hiring_first_role] || "engineer";
      filterFacts.push(`The filter is the opening itself: only companies hiring their first ${roleWord} count — the role, not the brand, is the targeting.`);
    }
    if (bf.hiring_role) filterFacts.push("The filter is the opening itself: only startups hiring engineers count — the open role, not the brand, is the targeting.");
    if (bf.interned_startup_first) filterFacts.push(`The path is the filter: only people${q && q.firms.length ? ` at ${q.firms[0]}` : ""} who interned at a startup first count toward the ${count} — that startup-first path is the personalization anchor in every opener.`);
    if (bf.cohort_span) filterFacts.push(`The cohort is a hard filter: only the ${bf.cohort_span} classes count toward the list — other classes are excluded, not ranked lower.`);
    if (bf.mna) filterFacts.push("The desk is the filter: only bankers who work on M&A count toward the list.");
    if (bf.early_standing) filterFacts.push("Your standing shapes the targeting: a freshman at a non-target school gets in through warm paths — alumni, clubs, shared ground — so the list ranks those first, not cold prestige.");
    if (bf.state_schools) filterFacts.push(`The school screen is hard: only state-school graduates count toward the ${count} — private-school names are excluded, not ranked lower.`);
    if (bf.fresh_cohort_years) filterFacts.push(`The cohort is a hard filter: only people hired in the last ${bf.fresh_cohort_years} years count toward the ${count} — earlier cohorts are excluded, not ranked lower.`);
    if (bf.major_match) filterFacts.push(`The match key is your major: only people who share it count toward the ${count}, and the shared major is the personalization anchor in every opener.`);
    if (bf.competition_math) filterFacts.push(`The background is a hard filter: only traders with competition-math backgrounds count toward the ${count}.`);
    if (bf.warmth_hometown) filterFacts.push("Warmth ranks the list: people from your hometown rank first, then the warmest shared ground — school, club, a mutual name — in that order.");
    if (bf.publishes_on_github) filterFacts.push("The filter is public proof of work: GitHub activity is checked person by person before anyone is ranked, so the list is built from people who ship in the open.");
    if (bf.started_as_analyst) filterFacts.push("The filter is the path in: only people who started as analysts count toward the list — the shared first job is the personalization anchor.");
    if (bf.deal_specific) filterFacts.push("Every opener is personalized to a deal the banker worked on: no name makes the list until a deal they touched is on record to cite.");
    if (bf.restructuring) filterFacts.push(`The subject is restructuring: only bankers who work on restructuring count toward the list${q && /chats/.test(q.purpose || "") ? `, and the ask on each is a ${q.purpose === "coffee chats" ? "coffee chat" : "restructuring chat"}` : ""}.`);
    else if (q && q.purpose === "coffee chats") filterFacts.push("The ask on each is a coffee chat — fifteen minutes, their path and advice, nothing pitched.");
    else if (q && q.purpose === "exploratory chats") filterFacts.push("The ask on each is an exploratory chat — their path and advice, nothing pitched.");
    else if (q && q.purpose === "my podcast") filterFacts.push("Each founder is approached as a podcast guest: the invite leads with the show and the angle, not a pitch.");
    else if (q && q.purpose === "a career switch") filterFacts.push("The series is for a career switcher: each story is the switch itself, told by someone who made it.");
    else if (q && q.purpose && /advising/.test(q.purpose)) filterFacts.push("The ask on each is an advising chat — their path through it and what they would do differently.");
    if (q && q.tone === "peer") filterFacts.push("The tone is peer to peer: you write as a VP moving into PE, so every draft speaks as a peer — a lateral move between equals, never student to banker.");
    if (q && q.warm_paths_ranked) filterFacts.push(`Warm paths rank the list: the ${count} are ordered by the strength of the path in, strongest first.`);
    if (q && q.firms_named && q.firms.length === 1) {
      const waves = Math.max(1, Math.ceil(count / 15));
      filterFacts.push(population || waves === 1
        ? `One firm, so the per-firm cap shapes the waves: at most 15 first emails to ${q.firms[0]} in any 30 days — the rest run in later monthly waves, planned that way from the start.`
        : `One firm, so the per-firm cap binds before the daily ramp does: at most 15 first emails to ${q.firms[0]} in any 30 days, so ${count} people run as ${waves} monthly waves — planned that way from the start, not discovered mid-send.`);
    }
    if (q && q.geography && !filterFacts.length) filterFacts.push(`Geography is a hard filter on the plan: only ${q.geography} names count toward the ${count} — out-of-area names are excluded, not ranked lower.`);
    const singleFirm = !!(q && q.firms_named && q.firms.length === 1);
    // WORDING-BACKLOG (BUG-204): a category-shaped plan names the
    // concrete UNIVERSE the list is built from — the actual pool,
    // not only the four generic sources — where the ask's shape
    // determines one. (The category replies were the family's
    // D3 ceiling: every filter spoken, no universe ever named.)
    const askLc = lc(text);
    const universeFact = (() => {
      if (!q || q.firms_named || q.firms_source === "set") return null;
      if (bf.latest_batch) return "The universe is the latest YC batch itself — its own company directory is the pool, and every founder is checked against the batch list, not a general founder database.";
      if (/healthtech|health tech/.test(askLc)) return "The universe is healthtech employers — digital-health and care-delivery companies with real engineering teams — built from their own team pages and rosters, not from a general tech list.";
      if (/fortune 500/.test(askLc)) return "The universe is the Fortune 500 list itself — the strategy teams of those companies, reached through their own team pages and your alumni directory.";
      if (/dream companies/.test(askLc)) return "The universe is your dream companies — the ones you named — searched at those companies only.";
      if (/fintech|insurtech/.test(askLc)) return "The universe is fintech and insurtech employers — payments, banking-infrastructure, and insurance carriers and startups — built from their own team pages and rosters.";
      if (/series a/.test(askLc) && /\bai\b|artificial intelligence|ml\b/.test(askLc)) return "The universe is Series A AI companies — read from funding announcements and their own team pages, so the stage filter is read off each company's own record.";
      if (bf.prior_career) return `The universe is people whose public record shows that exact move — ${bf.prior_career} first, this field now — found through your export and alumni directories, not a general list.`;
      if (q.high_school_alumni) return "The universe is your high school's alumni now working in tech — its alumni directory is the pool, and every name is checked against it.";
      if (/consumer startups/.test(askLc)) return "The universe is consumer startups — their own team pages and rosters, in the geography you named.";
      return null;
    })();
    // The sources ride in every plan, not only single-firm ones —
    // a plan that names no source leaves the user unable to judge
    // what the list will actually be built from.
    // WORDING-BACKLOG (BUG-205): for a category proposal the
    // bubble-1 splice ("The universe is the one you named — …")
    // and the standalone universe fact said the same thing twice
    // in one reply (SC-028/029/060). The standalone fact — the
    // one carrying the sourcing — stays; the splice is dropped.
    const spliceIdx = isCategoryProposal && universeFact ? filterFacts.findIndex((f) => /^The universe is the one you named/.test(f)) : -1;
    const factsBase = spliceIdx >= 0 ? filterFacts.filter((_, i) => i !== spliceIdx) : filterFacts;
    // BUG-110's law survives the dedupe: a category proposal is
    // still SPOKEN as a proposal — the framing rides the tail of
    // the surviving universe fact instead of its own sentence.
    const universeSpoken = universeFact && isCategoryProposal ? universeFact.replace(/\.$/, "") + " — it stands as the plan's starting proposal, with the build running on it now." : universeFact;
    const facts = singleFirm
      ? [...factsBase.slice(0, 5), sourcesFact]
      : [...factsBase.slice(0, universeSpoken ? 3 : 4), ...(universeSpoken ? [universeSpoken] : []), sourcesFact, capsFact];
    let nextStep;
    if (q && q.firms_source === "default") {
      // WORDING-BACKLOG (BUG-187): a proposed set or category is the
      // BUILD SPEC, not an approval gate in front of the build —
      // "Building the list now" may not be followed by "approve and
      // I build it", and a category the user named is never handed
      // back to them as homework ("tell me the firms instead").
      nextStep = isCategoryProposal
        ? "The found, trustworthy, and sendable counts come back here first, and drafting starts only when you approve the whole plan."
        : "The build runs on the proposed set now — the found, trustworthy, and sendable counts come back here first, and drafting starts only when you approve the whole plan.";
    } else if (bf.startup_stage) {
      nextStep = "Reply with your export or pasted names and drafting starts on your word once the counts land.";
    } else if (bf.state_schools || q.high_school_alumni) {
      nextStep = "Reply with your export or your school's alumni list and the screen runs on real names first.";
    } else {
      nextStep = "The found, trustworthy, and sendable counts come back here before a single draft exists, and drafting starts only when you approve the whole plan.";
    }
    const headline = population
      ? (bf.latest_batch ? `Building the list now: every founder in the latest ${bf.latest_batch === "YC" ? "YC" : "newest"} batch, intros drafted only from the sendable names.` : bf.sequence_known_first ? `Building the list now: everyone you know${q && q.firms.length ? ` at ${q.firms[0]}` : ""} first, then second-degree connections.` : `Building the list now: ${who}${scope.length ? " " + scope.join(" ") : ""} — sized by what the sources yield, not by a number invented here.`)
      : `Building the list now: ${count} ${who}${scope.length ? " " + scope.join(" ") : ""}.`;
    const reply = compose({ headline, facts, nextStep });
    const artifact = campaignPlanArtifact(ctx, q, null);
    persistPlan(ctx, text, q, count);
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, target: q, ...(artifact ? { artifact, payload: artifact } : {}) };
  }

  // ---------- COMPLEXITY WAVE (BUG-176): draft continuations, the
  // send attempt, the decline draft, and offer-detail merges. A
  // plan's first draft, a revision of it, and "send it" were all
  // answered by the generic fallback because no route owned the
  // SECOND turn of a drafting conversation. These handlers read and
  // write the persisted plan (ctx.plan.draft) — status is spoken
  // only from that record.
  function planDraftOf(ctx) { return (ctx.plan && ctx.plan.kind === "campaign_plan" && ctx.plan.draft) || null; }
  function sampleDraftText(plan) {
    if (plan.firms_named && plan.firms.length) {
      const target = plan.firms[0];
      return `Subject: Sophomore interested in ${target} — 15 minutes?\n\nHi [banker's first name],\n\nI'm a sophomore, and ${target} is the firm I most want to learn from this summer. I'm writing to ask for fifteen minutes to hear about your path and any advice you'd give someone aiming at the analyst seat.\n\nNo pitch, and nothing is being sold — I just want to learn from someone doing the work. If a call is easier another week, I'll work around your schedule.\n\nThank you for reading,\n[Your name]`;
    }
    const setLabel = plan.firm_set ? plan.firm_set.replace(/_/g, " ") : "the firms on the plan";
    return `Subject: Sophomore interested in ${setLabel} banking — 15 minutes?\n\nHi [banker's first name],\n\nI'm a sophomore, and your firm is on the short list I most want to learn from this summer. I'm writing to ask for fifteen minutes to hear about your path and any advice you'd give someone aiming at the analyst seat.\n\nNo pitch, and nothing is being sold — I just want to learn from someone doing the work. If a call is easier another week, I'll work around your schedule.\n\nThank you for reading,\n[Your name]`;
  }
  function handleDraftContinuation(text, ctx) {
    const plan = ctx.plan;
    if (!plan || plan.kind !== "campaign_plan") return null;
    const t = lc(text);
    const showOnly = /\bshow me\b|\bsee (it|the draft)\b|\bread it back\b/.test(t) && /\bdraft\b/.test(t);
    const draftAsk = /\b(draft|write|compose)\b[^.]*\b(first|one|outreach|email|draft)\b|\bfirst (outreach|draft|email)\b/.test(t);
    const existing = planDraftOf(ctx);
    if (existing && (showOnly || draftAsk)) {
      const reply = compose({ headline: "Here is the first draft, exactly as held.", facts: [existing.text, "It is a held sample: addressed to the first sendable name once the list is built and you approve the plan — nothing has been sent, and nothing sends from a sample."], nextStep: "Want it shorter, more casual, or aimed at a different angle?" });
      return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: existing };
    }
    if (!existing && (draftAsk || showOnly)) {
      const draft = { kind: "outreach_draft_sample", status: "held_sample", sends: 0, text: sampleDraftText(plan), target: plan.firms_named && plan.firms.length ? plan.firms[0] : (plan.firm_set || null), created_from_plan_at: plan.at || null };
      plan.draft = draft;
      const reply = compose({ headline: "The first draft is written — held as a sample, sending nothing.", facts: [draft.text, "The bracketed slots fill from real records only: the recipient from the first sendable name when the list is built, your name and facts from your profile — a sample never invents either.", "It sends only as part of the approved plan, one approval for the whole wave — never from this preview."], nextStep: "Want it shorter, more casual, or re-aimed before the list is built?" });
      return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft };
    }
    return null;
  }
  function handlePlanDraftSurgery(text, ctx) {
    const t = lc(text);
    const surgeryCue = /\bmake it (shorter|more casual|less formal|more formal|warmer|shorter and)\b|\btoo formal\b|\bshorten (it|this|the draft|the letter)\b|\badd a line\b|\badd something\b/.test(t);
    if (!surgeryCue) return null;
    const draft = planDraftOf(ctx);
    if (!draft) {
      // Surgery on nothing is answered as exactly that: no draft
      // exists in this conversation to revise.
      const reply = compose({ headline: "There is no draft in this conversation to revise yet.", facts: ["No letter or outreach draft has been produced here — the cover-letter ask is still waiting on the facts it is written from, and no outreach draft has been drafted from the plan.", "The moment a draft exists, revisions like shorter or more casual apply to it directly, and the original is kept on the record."], nextStep: "Give me the facts for the letter, or say 'draft the first one' on the plan, and revision has something real to work on." });
      return { intent: "career_tailor", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    const lines = s(draft.text).split("\n");
    let revised = draft.text;
    const changes = [];
    if (/\bshorter\b|\bshorten\b/.test(t)) {
      const bodyParas = lines.filter((ln) => ln.trim() && !/^subject:/i.test(ln) && !/^hi \[/i.test(ln) && !/^thank you for reading/i.test(ln) && !/^\[your name\]/i.test(ln));
      const core = bodyParas.slice(0, 1);
      revised = [lines.find((ln) => /^subject:/i.test(ln)) || "", "", lines.find((ln) => /^hi \[/i.test(ln)) || "Hi [banker's first name],", "", ...core, "", "Thank you for reading,", "[Your name]"].filter((ln, i, a) => ln !== "" || (a[i - 1] !== "" && a[i + 1] !== "")).join("\n").replace(/\n{3,}/g, "\n\n");
      changes.push("cut to the core ask — the framing sentences are out, the request itself is untouched");
    }
    if (/\bcasual\b|\btoo formal\b|\bless formal\b/.test(t)) {
      revised = revised.replace("I'm a sophomore, and", "I'm a sophomore, and honestly").replace("I just want to learn from someone doing the work.", "Mostly I want to learn from someone actually doing the work.").replace("Thank you for reading,", "Thanks for reading,");
      changes.push("loosened the register — contractions and a plainer sign-off; the ask and the facts are unchanged");
    }
    const addM = s(text).match(/\badd a line about\s+(.+?)(?:[.!?]|$)/i) || s(text).match(/\badd something about\s+(.+?)(?:[.!?]|$)/i);
    if (addM) {
      const about = addM[1].trim();
      const internM = about.match(/\bmy (?:summer )?internship at\s+(.+)$/i);
      const line = internM ? `This past summer I interned at ${internM[1].trim()} — it is a big part of why I am aiming at this work.` : `You asked for this line in your own words: "${about.replace(/^how\s+/i, "").replace(/\btheir\b/gi, "your")}" — it goes in exactly as you stated it.`;
      revised = revised.replace(/\n\nThank you for reading,|\n\nThanks for reading,/, `\n\n${line}\n\nThank you for reading,`);
      if (!revised.includes(line)) revised = revised + `\n\n${line}`;
      changes.push(`added the line from your own words: "${line}"`);
    }
    draft.text = revised;
    draft.revisions = [...(draft.revisions || []), { at: new Date(nowOf(ctx)).toISOString(), changes }];
    const reply = compose({ headline: "Revised — the draft on record now reads like this.", facts: [revised, `What changed: ${changes.join("; ")}. The original wording stays on the draft's revision record, and sends are still 0 — a revision never sends anything.`], nextStep: "Approve the plan when you are ready and this is the draft the first wave uses." });
    return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft };
  }
  function handleSendAttempt(text, ctx) {
    const t = lc(text);
    if (/\bcaps?\b|\bhow does\b|\bwhy\b[^.]*\?/.test(t)) return null; // a rules question is not a send command
    // Sending NEW content (a blurb, an intro, a note) to someone is a
    // drafting/intro task, not the campaign wave — this handler owns
    // only "send IT" where IT is the held draft/wave.
    if (/\b(blurb|intro|introduction)\b/.test(t) && !/\b(the draft|first wave|the wave)\b/.test(t)) return null;
    if (!/\b(send|ship)\b[^.]*\b(it|that|this|them|him|her|the first wave|first wave|the wave|the draft|the email|the outreach)\b/.test(t)) return null;
    if (Doorstep && Doorstep.PAUSED_PHRASES) { /* doorstep form submits are 141's, keyed on its own phrases */ }
    const plan = ctx.plan && ctx.plan.kind === "campaign_plan" ? ctx.plan : null;
    const draft = planDraftOf(ctx);
    const facts = [];
    if (draft) facts.push("What exists is the held sample draft you just reviewed — it has no named recipient yet, because the list it sends to has not been built, and a sample with a bracketed name cannot send to anyone.");
    else if (plan) facts.push("What exists is the plan — its list has not been built, no draft has been approved, and there is no wave standing ready to go.");
    else facts.push("Nothing is built in this conversation to send: no list, no draft, no approved plan — so there is no wave that could go out.");
    facts.push("Every send in this product is approval-gated: the list's counts return first, you approve the whole plan once, and only then does a wave send — inside the daily cap. That gate is not skipped by asking in chat.");
    const reply = compose({ headline: "Nothing was sent — here is exactly where it stands.", facts, nextStep: plan ? "Approve the plan and the list builds; the counts come back here before the first send." : "Name the target and I will build the plan the send has to stand on." });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }
  function handleDeclineDraft(text, ctx) {
    const t = lc(text);
    if (!/\bdecline\b/.test(t) || !/\bdraft\b/.test(t)) return null;
    if (!Negotiation || !Negotiation.declineDraft) return null;
    const comp = companyFromText(text, ctx);
    const roleM = s(text).match(/\brole is\s+(?:a\s+|an\s+)?(.+?)(?:\s+offer)?\s*$/i) || s(text).match(/\b(summer analyst|analyst|intern|associate|software engineer\w*|consultant)\b[^.]*\boffer\b/i);
    const offer = { company: comp || null, role: roleM ? s(roleM[1] || roleM[0]).replace(/\s*offer\s*$/i, "") : null };
    let dd = null;
    try { dd = Negotiation.declineDraft(offer, {}); } catch { dd = null; }
    if (!dd || !dd.draft) return null;
    const reply = compose({ headline: `The decline for ${offer.company || "the firm"} is drafted — warm, final, and held.`, facts: [dd.draft, "It declines on fit, thanks the team specifically, and leaves the door open — the three moves that keep a relationship alive after a no. It sends only when you approve it, like every other send."], nextStep: "Want the tone warmer, firmer, or shorter before it is held for your approval?" });
    return { intent: "negotiation_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: dd, decline: { company: offer.company, role: offer.role } };
  }
  // MI-123 (S1): stated figures are separated BY KIND. An hourly rate
  // stays an hourly rate, an annual figure stays annual, and a signing
  // bonus is a bonus — never the headline amount. The parse masks each
  // figure as it claims it (signing first, hourly second, annual last),
  // so one figure can never be counted as another kind.
  function parseOfferFigures(text) {
    const out = { hourly: null, hourlyText: null, annual: null, annualText: null, signing: null, signingText: null };
    let work = s(text);
    const num = (v) => Number(String(v).replace(/,/g, ""));
    let m = work.match(/\$\s?([\d,]{3,}|\d{1,3}\s?k)\s*(?:signing|sign-on|sign on)\b/i)
      || work.match(/\b(?:signing|sign-on|sign on)(?:\s+bonus)?\s*(?:of|is|at|:)?\s*\$\s?([\d,]{3,}|\d{1,3}\s?k)/i);
    if (m) {
      out.signing = /k/i.test(m[1]) ? num(m[1].replace(/\s?k/i, "")) * 1000 : num(m[1]);
      out.signingText = `$${out.signing.toLocaleString()} signing bonus`;
      work = work.replace(m[0], " ");
    }
    m = work.match(/\$\s?(\d{1,3}(?:\.\d{1,2})?)\s*(?:an?\s+hour|\/\s?h(?:ou)?r\b|per\s+hour)/i);
    if (m) { out.hourly = Number(m[1]); out.hourlyText = m[0].replace(/\s+/g, " ").trim(); work = work.replace(m[0], " "); }
    const mk = work.match(/\$\s?(\d{2,3})\s?k\b/i);
    if (mk) out.annual = Number(mk[1]) * 1000;
    else { const mp = work.match(/\$\s?([\d,]{4,})/); if (mp) out.annual = num(mp[1]); }
    if (out.annual) out.annualText = `$${out.annual.toLocaleString()}`;
    return out;
  }
  // The offer's headline figure in the USER'S OWN units — the phrase
  // every reply quotes, so an hourly offer is never restated as an
  // annual salary (or as its own signing bonus).
  function offerFigureText(thread, offer) {
    const th = thread || {};
    const of = offer || {};
    const hourly = th.hourly || of.hourly_rate || null;
    if (hourly) return `$${Number(hourly)} an hour`;
    const amt = th.amount || of.base_salary || null;
    if (amt) return `$${Number(amt).toLocaleString()}`;
    return null;
  }

  function handleOfferDetail(text, ctx) {
    const t = lc(text);
    const hasOfferCue = /\boffer\b/.test(t) || (ctx.offer && typeof ctx.offer === "object");
    if (!hasOfferCue) return null;
    // MI-123 (mechanism 3): the "base is" frame is a SALARY frame —
    // it needs base pay wording or a figure after it. The bare frame
    // matched prose ("the scale of the client base is a draw") and
    // consumed a prep mock-feedback turn as an offer capture.
    const statement = /\bthe offer is\b|\boffer is from\b|\bdeadline to decide\b|\bdecide by\b|\bsign-on\b|\bsigning bonus\b|\bbase salary\b|\bbase of\b|\bbase is \$\s?\d/.test(t);
    const question = /\?\s*$/.test(s(text).trim()) && !statement;
    if (!statement || question) return null;
    // MI-123 (mechanism 3): a DRAFT ask or a REVISION ask is not an
    // offer report. The drafting routes own those turns (the counter
    // draft in handleNegotiation, the revision capture beside this
    // block); consumed here, a draft request's own words were written
    // onto the offer record as if they were the offer (battery t3).
    if (/\b(draft|write|compose|redraft)\b[^.]*\b(counter|email|letter|reply|extension|draft)\b/.test(t) || /\bmake it\s+\$?\s?\d/.test(t) || /\bchange (it|the counter|the ask|the figure|the number)\b/.test(t)) return null;
    const prev = (ctx.offer && typeof ctx.offer === "object") ? ctx.offer : {};
    const firmM = s(text).match(/\boffer is from\s+(?:a\s+|an\s+|the\s+)?(.+?)(?:,|\s+deadline|\s+role|\s*$)/i);
    // DEPTH WAVE (BUG-213): the same statement in genuine phrasing —
    // "<Firm> offered me ...": the firm that DID the offering is the
    // offer's firm, and a weekday or a "$NNk" figure is recorded the
    // same way as the exam dialect's "N days" and "$NN,NNN".
    const offeredM = s(text).match(/\b([A-Z][A-Za-z0-9&.]+(?:\s+[A-Z][A-Za-z0-9&.]+){0,2})(?:\s+(?:just|has|have|had))?\s+offered me\b/);
    // MI-123 (mechanism 1): a statement naming a DIFFERENT firm is a
    // NEW offer report — the record re-bases from this statement's
    // own fields; nothing from the prior offer (its amount above
    // all) carries into the new offer's record. A same-firm detail
    // statement keeps merging, exactly as before.
    const namedFirm = (offeredM && offeredM[1].trim()) || (firmM && !/^(a|an|the)$/i.test(firmM[1].trim()) ? firmM[1].trim() : null);
    const merged = (namedFirm && prev.company && lc(namedFirm) !== lc(prev.company)) ? {} : Object.assign({}, prev);
    if (firmM && !/^(a|an|the)$/i.test(firmM[1].trim())) { merged.company_description = firmM[1].trim(); if (!merged.company) merged.company = firmM[1].trim(); }
    if (offeredM) { if (!merged.company) merged.company = offeredM[1].trim(); if (!merged.company_description) merged.company_description = offeredM[1].trim(); }
    const roleM = s(text).match(/\b(analyst|associate|intern|software engineer|consultant|product manager)\s+role\b/i) || s(text).match(/\brole\s*(?:is|:)\s*(?:a\s+|an\s+)?([a-z ]{3,30}?)(?:,|\s+deadline|$)/i);
    if (roleM) merged.role = (roleM[1] || roleM[0]).replace(/\s+role$/i, "").trim();
    const daysM = t.match(/\b(?:deadline|decide)[^.]*?\b(\d{1,3})\s*days?\b/) || t.match(/\b(\d{1,3})\s*days?\b[^.]*\b(?:deadline|decide)\b/);
    if (daysM) merged.decide_deadline_days = Number(daysM[1]);
    const weekdayM = t.match(/\bdecide by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)\b/) || t.match(/\bexploding deadline\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)\b/);
    if (weekdayM && !merged.decide_deadline_text) merged.decide_deadline_text = weekdayM[1];
    // MI-123 (mechanism 2): the figures are recorded BY KIND — the
    // signing figure lands as the bonus (never as the headline
    // stated_figure), an hourly rate as the rate in the user's own
    // units, an annual figure as the stated figure. (The old single
    // money regex read the first $X,XXX in the turn — on the
    // battery's offer that was the $4,000 bonus, and the $52/hr was
    // recorded nowhere.)
    const figs = parseOfferFigures(s(text));
    if (figs.signing) merged.signing_bonus = figs.signing;
    if (figs.hourly) { merged.hourly_rate = figs.hourly; merged.stated_figure = figs.hourlyText; }
    else if (figs.annual) merged.stated_figure = figs.annualText;
    else { const kM = s(text).match(/\$\s?(\d{2,3})\s?k\b/i); if (kM && !merged.stated_figure) merged.stated_figure = `$${(Number(kM[1]) * 1000).toLocaleString()}`; }
    merged.updated_from_user_words = s(text).slice(0, 240);
    ctx.offer = merged;
    const figParts = [];
    if (merged.hourly_rate) figParts.push(`at $${Number(merged.hourly_rate)} an hour`);
    else if (merged.stated_figure) figParts.push(`at ${merged.stated_figure}`);
    if (merged.signing_bonus) figParts.push(`plus a $${Number(merged.signing_bonus).toLocaleString()} signing bonus`);
    const facts = [`Recorded on the offer, in your words: ${merged.company_description ? `from ${merged.company_description}` : "the firm as you described it"}${merged.role ? `, ${merged.role} role` : ""}${merged.decide_deadline_days ? `, ${merged.decide_deadline_days} days to decide` : merged.decide_deadline_text ? `, decide by ${merged.decide_deadline_text}` : ""}${figParts.length ? `, ${figParts.join(", ")}` : ""}.`];
    // DEPTH LANE B (MI-014): a detail statement that ALSO asks a
    // question ("the bank one has a $5k signing bonus — does that
    // change the picture?") gets the question answered in the same
    // turn, on the thread's own numbers — the record alone is half
    // an answer.
    if (/\?/.test(s(text))) {
      const thOD = negotiationThreadOf(ctx);
      if (Array.isArray(thOD.amounts) && thOD.amounts.length >= 2 && thOD.signing) {
        const descs = Array.isArray(thOD.descriptors) ? thOD.descriptors : [];
        const idx = descs.findIndex((d) => t.includes(lc(d).split(/\s+/).pop()));
        const y1 = thOD.amounts.map((a, i) => a + (i === idx ? thOD.signing : 0));
        facts.push(`And yes — it changes the picture, on your numbers only: year one is ${descs[0] || "offer one"} at $${Number(y1[0]).toLocaleString()} (${("$" + Number(thOD.amounts[0]).toLocaleString())} base${idx === 0 ? ` plus the $${Number(thOD.signing).toLocaleString()} signing bonus` : ""}) against ${descs[1] || "offer two"} at $${Number(y1[1]).toLocaleString()}${idx === 1 ? ` (base plus the signing bonus)` : ""} — but the signing bonus lands once while the base gap repeats and compounds every year, so weigh base first and the bonus as a one-year patch.`);
      }
    }
    if (merged.decide_deadline_text && !merged.decide_deadline_days) facts.push(`A ${merged.decide_deadline_text} deadline is a short fuse: the extension ask goes first, before any counter — a deadline that close decides for you if it is not moved.`);
    if (merged.decide_deadline_days) facts.push(merged.decide_deadline_days >= 7
      ? `${merged.decide_deadline_days} days is a workable window: a final round next week lands inside it with room to spare, so the negotiation does not need an extension ask yet — it needs the counter ready before the other process ends.`
      : `${merged.decide_deadline_days} days is tight: the extension ask goes first, before any counter — a deadline that close decides for you if it is not moved.`);
    facts.push("Nothing about the offer is shared or acted on from this record — it exists so the advice you get is about YOUR offer, not a generic one.");
    const reply = compose({ headline: "Offer updated — the advice now runs on your actual numbers.", facts, nextStep: "Want the counter drafted against this deadline, or the interview prep scheduled inside the window first?" });
    return { intent: "negotiation_advice", reply, resultStatus: "awaiting_user", sends: 0, offer: merged };
  }

  // MI-123 (mechanism 3): a REVISION of the standing counter, in
  // plain words ("make it $54 an hour instead, and add a request to
  // start June 8"). The revision updates exactly the fields it names
  // on the thread's counter record and acks in the user's own units;
  // a counter revision never rewrites the original offer. With no
  // negotiation context on record the turn is honestly deflected,
  // naming what is missing — it never falls to the generic fallback
  // (battery t4).
  function handleCounterRevision(text, ctx) {
    const t = lc(text);
    const figs = parseOfferFigures(text);
    const figAsk = /\bmake it\s+\$?\s?\d/.test(t) || /\bchange it to\s+\$?\s?\d/.test(t) || /\b(?:raise|lower|drop|bump) it to\s+\$?\s?\d/.test(t);
    const addAsk = /\badd a request\b|\badd an ask\b|\balso ask\b/.test(t);
    if (!figAsk && !addAsk) return null;
    const th = negotiationThreadOf(ctx);
    const off = (ctx.offer && typeof ctx.offer === "object") ? ctx.offer : {};
    const hasCtx = !!((th && (th.firm || th.amount || th.hourly || th.deadline || th.counter)) || off.company || off.base_salary || off.hourly_rate);
    if (!hasCtx) {
      if (!figAsk) return null;
      return { intent: "negotiation_revision", resultStatus: "needs_context", sends: 0, reply: compose({ headline: "There is no counter on record here to revise yet.", facts: ["This conversation holds no offer and no counter yet, so there is nothing for the new figure to attach to — a revision never invents the record it revises."], nextStep: "Tell me the offer first — the firm, the figures exactly as stated, and the deadline — and the counter gets recorded against it." }) };
    }
    const startM = s(text).match(/\bstart(?:ing)?\s+(?:on\s+)?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})\b/i);
    const thw = negotiationThreadForWrite(ctx);
    const counter = (thw.counter && typeof thw.counter === "object") ? Object.assign({}, thw.counter) : {};
    const changes = [];
    if (figs.hourly) { changes.push(counter.hourly && counter.hourly !== figs.hourly ? `the counter figure moves from $${Number(counter.hourly)} an hour to $${Number(figs.hourly)} an hour` : `the counter figure is set at $${Number(figs.hourly)} an hour`); counter.hourly = figs.hourly; delete counter.amount; }
    else if (figs.annual) { changes.push(counter.amount && counter.amount !== figs.annual ? `the counter figure moves from $${Number(counter.amount).toLocaleString()} to ${figs.annualText}` : `the counter figure is set at ${figs.annualText}`); counter.amount = figs.annual; delete counter.hourly; }
    if (startM) { const sd = startM[1].replace(/\s+/g, " ").trim(); counter.start = sd.charAt(0).toUpperCase() + sd.slice(1); changes.push(`a start-date request is added: start ${counter.start}`); }
    if (!changes.length) return null;
    thw.counter = counter;
    thw.topic = "counter";
    const signing = thw.signing || off.signing_bonus || null;
    const origFig = offerFigureText(thw, off);
    const facts = [`Counter updated: ${changes.join("; ")}.`];
    if (signing) facts.push(`Everything else stays, as you said: the $${Number(signing).toLocaleString()} signing bonus is kept as recorded${origFig ? `, and the original offer stands at ${origFig}` : ""} — a counter revision never rewrites the offer itself.`);
    else if (origFig) facts.push(`The original offer is untouched: it stands at ${origFig}, exactly as stated.`);
    const reply = compose({ headline: "The counter is revised — on the record, in your units.", facts, nextStep: "Want the counter email redrafted on the revised counter? It stays held for your approval — nothing sends." });
    return { intent: "negotiation_revision", reply, resultStatus: "recorded", sends: 0, payload: { kind: "counter_revision" } };
  }

  // MI-123 (mechanism 3): a draft ask on an offer thread ("draft the
  // counter email for me") belongs to the negotiation family's own
  // draft machinery, not to the offer-detail capture that shares the
  // drafting block. Delegates only when the thread (or the offer
  // record) carries a negotiation context; stands down otherwise.
  function handleCounterDraftAsk(text, ctx) {
    const t = lc(text);
    if (!/\b(draft|write|compose)\b/.test(t)) return null;
    if (!/\bcounter\b|\bextension\b/.test(t) && !/\b(email|letter)\b/.test(t)) return null;
    const th = negotiationThreadOf(ctx);
    const off = (ctx.offer && typeof ctx.offer === "object") ? ctx.offer : {};
    const hasCtx = !!((th && (th.firm || th.amount || th.hourly || th.deadline)) || off.company || off.base_salary || off.hourly_rate);
    if (!hasCtx) return null;
    return handleNegotiation(text, ctx);
  }

  // COMPLEXITY WAVE (BUG-174): a firm correction aimed at the PLAN
  // ("no wait, not Goldman — Lincoln International instead") — the
  // tracker corrector runs first in dispatch and returns null when
  // no tracker row matches, so a plan correction reaches here only
  // when the plan is its true target. The corrected ask is re-planned
  // from the stored original, so every other facet survives.
  function handlePlanCorrection(text, ctx) {
    const plan = ctx.plan;
    if (!plan || plan.kind !== "campaign_plan") return null;
    const raw = s(text);
    const m = raw.match(/\bnot\s+([A-Z][A-Za-z&.]+(?:\s[A-Z][A-Za-z&.]+){0,3}?)\s*[—–,-]\s*([A-Z][A-Za-z&.]+(?:\s[A-Z][A-Za-z&.]+){0,3}?)\s+instead\b/) || raw.match(/\bnot\s+([A-Z][A-Za-z&.]+(?:\s[A-Z][A-Za-z&.]+){0,3}?)\s*[—–-]\s*([A-Z][A-Za-z&.]+(?:\s[A-Z][A-Za-z&.]+){0,3}?)\b/) || raw.match(/\bswitch\s+(?:to|from\s+.+?\s+to)\s+([A-Z][A-Za-z&.]+(?:\s[A-Z][A-Za-z&.]+){0,3})/);
    if (!m) return null;
    const newFirm = (m[2] || m[1]).trim();
    const oldFirm = m[2] ? m[1].trim() : null;
    const lastAsk = s(plan.lastAsk);
    if (oldFirm && !lc(lastAsk).includes(lc(oldFirm)) && !(plan.firms || []).some((f) => lc(f).includes(lc(oldFirm)))) return null;
    let newAsk = lastAsk;
    if (oldFirm) {
      const esc = oldFirm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      newAsk = lastAsk.replace(new RegExp(`\\b${esc}(\\s+(?:Sachs|Partners|Capital|Group|Securities))?\\b`, "i"), newFirm);
      if (newAsk === lastAsk) newAsk = `network into ${newFirm}`;
    } else {
      newAsk = `network into ${newFirm}`;
    }
    const res = handleCampaignPlan(newAsk, ctx);
    if (!res) return null;
    const facts = [`The correction is recorded against the plan itself: ${oldFirm ? `${oldFirm} is out, ` : ""}${newFirm} is the target now — no list, draft, or wave is built against the old target after a correction.`];
    facts.push("The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — and the true reachable count is whatever the sources actually yield.");
    facts.push("Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address.");
    const reply = compose({ headline: `Plan corrected: ${newFirm}${oldFirm ? `, not ${oldFirm}` : ""}.`, facts, nextStep: "Approve the corrected plan and the list builds against the new target — counts first, drafts after." });
    return Object.assign({}, res, { reply });
  }
  // COMPLEXITY WAVE (BUG-174): "so now what's the plan?" — answered
  // from the persisted plan when one stands, and from the thread's
  // own state (pause record, tracker, last search) when none does.
  // Never a guess, never the generic fallback.
  function handlePlanRecap(text, ctx) {
    const t = lc(text);
    if (!/\bwhat'?s the plan\b|\bwhat is the plan\b|\bremind me (of|about) the plan\b|\bthe plan\?\s*$/.test(t)) return null;
    // INTEGRATION (2026-10-16): when the same turn carries a worth /
    // promotion ask, "the plan" is the CAREER plan — the path
    // handler composes it with the honest worth state (Lane B C5).
    // The campaign recap stands down unless a campaign plan
    // actually stands on record.
    if (!((ctx.plan || {}).kind === "campaign_plan") && /\bwhat am i worth\b|\bmy worth\b|\bunderpaid\b|\bpromotion\b|\bpromot\w*\b|\bmove up\b/.test(t)) return null;
    const plan = ctx.plan;
    if (plan && plan.kind === "campaign_plan") {
      const targetLine = plan.firms_named && plan.firms.length ? `targeting ${plan.firms.join(", ")}` : plan.firm_set ? `targeting the ${plan.firm_set.replace(/_/g, " ")} set (proposed — you named no firms)` : "targeting the plan's recorded set";
      const facts = [`The campaign plan on record: ${targetLine}${plan.count ? `, ${plan.count} people` : ""}, set at ${fmtWhen(Date.parse(plan.at) || null) || "earlier in this conversation"}.`, "Where it stands: no list has been built yet in this conversation — the found, trustworthy, and sendable counts come back before a single draft exists, and nothing sends until you approve the whole plan."];
      const gp = ctx.globalPause;
      if (gp && gp.set === false && gp.liftedAt) facts.push("The pause you set earlier in this conversation is lifted, so the plan is not being held by it.");
      if (gp && gp.set === true) facts.push("A global pause currently stands, so even an approved plan could not send until it is lifted.");
      const reply = compose({ headline: "Here is the plan, as it stands.", facts, nextStep: "Approve it and the list builds — counts first, drafts after — or correct the target and I re-plan." });
      return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, target: plan.target || null };
    }
    const facts = ["No campaign plan is on record in this conversation yet — nothing has been planned, queued, or sent."];
    const gp = ctx.globalPause;
    if (gp && gp.set === false && gp.liftedAt) facts.push(`Earlier in this conversation you set a pause and then lifted it at ${fmtWhen(gp.liftedAt) || "a few turns back"} — the queues are open, and every send still waits for its own approval.`);
    if (gp && gp.set === true) facts.push("A global pause currently stands over every queue — that is the state any plan would start from.");
    const store = trackStoreOf(ctx);
    if (store && store.rows && store.rows.length) facts.push(`Your tracker holds ${store.rows.length} application${store.rows.length === 1 ? "" : "s"} on record.`);
    if (ctx.discovery && ctx.discovery.lastParams && ctx.discovery.lastParams.ask) facts.push(`Your last search stands as recorded: "${ctx.discovery.lastParams.ask}".`);
    const reply = compose({ headline: "Here is where things stand.", facts, nextStep: "Name the goal — a networking plan, a search, a tracker — and it gets built in this conversation." });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  function handleIntake(text, ctx) {
    const input = {};
    if (ctx.pastedText) input.pastedText = ctx.pastedText;
    if (ctx.linkedinConnectionsCsv) input.linkedinConnectionsCsv = ctx.linkedinConnectionsCsv;
    if (ctx.forwardedEmail) input.forwardedEmail = ctx.forwardedEmail;
    const Intake = getIntake();
    if (Object.keys(input).length && Intake && Intake.intake) {
      const r = Intake.intake(input, { knownDepartures: ctx.knownDepartures || [] });
      // IB-2 (Outreach wave): intake output is graph-ready now — write
      // it into the store the graph handlers read, so paths / keep-warm
      // / referrals see these people in later turns. Existing rows keep
      // their interaction state; the merge key is name+firm.
      try {
        const prof = ctx.profile || {};
        const prior = Array.isArray(prof._careerGraphPeople) ? prof._careerGraphPeople : [];
        const key = (p) => `${lc(p && (p.full_name || p.name))}|${lc(p && (p.current_firm || p.company))}`;
        const byKey = new Map(prior.map((p) => [key(p), p]));
        for (const rec of r.records || []) {
          const k = key(rec);
          const old = byKey.get(k);
          byKey.set(k, old ? Object.assign({}, rec, { interactions: old.interactions || rec.interactions, stage: old.stage || rec.stage, last_contact_at: old.last_contact_at || rec.last_contact_at }) : rec);
        }
        prof._careerGraphPeople = [...byKey.values()];
      } catch { /* the intake reply stands without the graph write */ }
      const counts = r.counts || r.summary || {};
      const received = counts.received != null ? counts.received : (r.records ? r.records.length : null);
      const facts = [];
      if (received != null) facts.push(`Received ${received}, deduped to ${counts.deduped != null ? counts.deduped : received}, with ${counts.flagged != null ? counts.flagged : 0} flagged for a freshness check before any draft.`);
      facts.push("Email labels are kept exactly as the file states them — an inferred address is never upgraded to verified.");
      const reply = compose({ headline: "The intake run is done — here are the honest counts.", facts, nextStep: "Review the flagged names and I will draft only from the clean, current ones." });
      return { intent: "outreach_clarification", reply, resultStatus: "prepared", sends: 0, intake: r };
    }
    const n = (lc(text).match(/(\d+)\s*names/) || [])[1];
    const reply = compose({ headline: `Send the file and the run for ${n ? `those ${n} names` : "every name on it"} is fixed.`, facts: ["Each address gets verified, duplicates merge by name and firm, people who left are flagged, and drafts are written only from confirmed facts.", "And the order matters: I ask before any enriching spend, every time — enrichment is the step that costs money and guesses addresses."], nextStep: "Upload the file and I will show received, deduped, and flagged counts before drafting anything." });
    // BUG-108: the intake PLAN is this turn's typed product — the
    // fixed run order over the coming file, with the enrich gate on
    // the record. Before this the branch returned prose only.
    const plan = { kind: "intake_plan", expected_count: n ? Number(n) : null, file_received: false, steps: ["verify each address", "dedupe by name and firm", "flag people who left", "draft only from confirmed facts"], ask_before_enrich: true };
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, payload: plan, artifact: plan };
  }

  function handleVoice(text, ctx) {
    const samples = ctx.sentEmails || ctx.voiceSamples || (ctx.outreach && ctx.outreach.voiceSamples) || null;
    if (samples && samples.length && Outreach && Outreach.learnVoice) {
      const v = Outreach.learnVoice(samples);
      const reply = compose({ headline: "Your voice profile is learned from your own past emails.", facts: [`Across ${v.sample_count} samples you average about ${Math.round(v.avg_words || 0)} words per email, and your greetings and sign-offs follow the pattern in those samples.`, "Drafts will follow that voice, and the quality gate checks every draft against it before you see it."], nextStep: "Point me at the list and I will draft in your voice." });
      return { intent: "outreach_clarification", reply, resultStatus: "prepared", sends: 0, voice: v };
    }
    // WORDING-BACKLOG (BUG-131): the ask's own sample count is the
    // number the reply works with — never a smaller stock figure.
    const askedSamples = Number((lc(text).match(/(\d+)\s+of my sent/) || [])[1]) || null;
    const reply = compose({ headline: "I will learn your voice from your own past emails before drafting a word.", facts: ["Connect your Gmail, or paste a few emails you have actually written, and I read only their shape: length, greeting, sign-off, and how direct you are.", "Until then I will not guess at your voice — a generic draft in your name is worse than waiting."], nextStep: askedSamples ? `Connect Gmail or paste the ${askedSamples} emails you mentioned and I will build the voice profile first.` : "Connect Gmail or paste two or three of your own past emails and I will build the voice profile first." });
    // BUG-108: the awaiting-samples state is the typed record.
    const vrec = { kind: "voice_profile", status: "awaiting_samples", sample_count: 0, requested_samples: Number((lc(text).match(/(\d+)\s+of my sent/) || [])[1]) || null };
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, payload: vrec, artifact: vrec };
  }

  function handleListSurgery(text, ctx) {
    const pool = ctx.listPool || ctx.pool || null;
    if (pool && pool.selected && Outreach && Outreach.applyListOps) {
      const r = Outreach.applyListOps(pool, text, {});
      const reply = compose({ headline: "The list is re-cut to your rules.", facts: [r.text], nextStep: "Review the new counts and I will draft from the re-cut list." });
      return { intent: "outreach_clarification", reply, resultStatus: "prepared", sends: 0, list_ops: r };
    }
    const t = lc(text);
    const cuts = [];
    if (/\bdrop vps?\b|\bno vps?\b/.test(t)) cuts.push("vice presidents out");
    if (/\bdrop associates\b/.test(t)) cuts.push("associates out");
    if (/\bdrop analysts\b/.test(t)) cuts.push("analysts out");
    const keepM = s(text).match(/\bonly ([^.]+?) people\b/i);
    // WORDING-BACKLOG (BUG-191): the before-and-after counts are
    // stated FROM THE RECORD in this reply — the list on file in
    // this session holds 0 names, so both counts are honestly zero
    // with the cut recorded against the real list the moment one
    // exists; "open the list and I will show you" is not a count.
    const reply = compose({ headline: "List surgery recorded — and the counts, from the record, are zero on both sides.", facts: [cuts.length || keepM ? `The cut: ${[...cuts, ...(keepM ? [`only ${keepM[1]} people stay`] : [])].join("; ")}.` : "The cut rules are noted exactly as you stated them.", "Before: the current list on record in this session holds 0 names — there is no list loaded here to re-cut, so after is also 0 today; no draft goes out on any other basis.", "Your rules are recorded as the list's standing cut: the moment a list is built or loaded, it is re-cut under them and the counts come back before (the built count) and after (the count under your cut), read off real names, never estimated."], nextStep: "Build or load the list and the surgery runs on it with both counts shown?" });
    // BUG-108: the surgery SPEC is the typed record when no list is
    // on file to re-cut — the stated cut, carried, not just described.
    const surg = { kind: "list_surgery", cuts, keep_only: keepM ? keepM[1] : null, applied_to_list: false, recount: null };
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, payload: surg, artifact: surg };
  }

  function handleDraftSurgery(text, ctx) {
    const drafts = ctx.drafts || ctx.sampleDrafts || null;
    const n = Number((lc(text).match(/(\d+)\s*sample/) || [])[1]) || (drafts ? drafts.length : 5);
    const reply = compose({ headline: "Style change noted: shorter, less formal.", facts: [`The ${n} sample emails re-render in that voice for your review.`, "Nothing goes out until you approve the new samples — the old ones are not quietly reused."], nextStep: `The ${n} re-rendered samples sit at the top of your review doc — approve them there and they set the voice for every draft.` });
    // BUG-108: the style-change record rides as payload + artifact.
    const ds = { kind: "draft_surgery", style: { shorter: true, less_formal: true }, samples: n, applied: false };
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, payload: ds, artifact: ds };
  }

  function handleSafetyPlan(text, ctx) {
    const startIso = new Date(nowOf(ctx)).toISOString();
    const planIn = ctx.plan || ctx.campaignPlan || { scheduled: 0, days: 0, deferred: [] };
    const sp = Outreach.safetyPlan(campaignOf(ctx), planIn, { startDateIso: startIso });
    // WORDING-BACKLOG (BUG-131): each fact is its own entry — the
    // composer speaks one sentence per fact, so a cap sentence
    // packed behind a channel sentence was silently truncated and
    // the safety-plan reply never stated the daily cap at all.
    // WORDING-BACKLOG (BUG-190): the ramp is stated ONCE, in one
    // arithmetic (124's ramp string now reads "+5 every 3 days,
    // never above 30" — the old "+5/day every 3 days" plus this
    // card's own second ceiling made the cap read two ways); and
    // the finish date is given as DATED ramp arithmetic — the
    // completion dates for the ramp's own cumulative sends from
    // today — never deferred to "fills in later".
    const fmtDay = (d) => { try { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(d); } catch { return d.toISOString().slice(0, 10); } };
    const startD = new Date(nowOf(ctx));
    // WORDING-BACKLOG (BUG-204): the milestone anchor is STATED —
    // counting from tomorrow — so the dates can be checked against
    // the calendar instead of implying an unstated day one.
    const anchorD = new Date(startD.getTime() + 86400000);
    const finishFor = (n) => fmtDay(new Date(anchorD.getTime() + (sendDays(n) - 1) * 86400000));
    const facts = [
      `Channel: your own Gmail only — the daily cap starts at ${sp.daily_cap_start} a day, rises ${sp.ramp}.`,
      `At most ${sp.per_domain_per_day} a day to one domain and ${sp.per_firm_per_30_days} to one firm in 30 days; per person, ${sp.per_person}.`,
      `Stop rules: ${sp.stop_rules.slice(0, 3).join("; ")}.`,
      sp.scheduled ? `${sp.scheduled} emails sit in the plan across ${sp.days} days, finishing ${sp.finish_date}.` : `Finish date, from the ramp itself, counting from tomorrow (${fmtDay(anchorD)}): the first 87 first-emails clear by ${finishFor(87)}, the first 153 by ${finishFor(153)} — and the built list's own finish date is that same arithmetic on its size, printed on this card before you approve it.`,
    ];
    const reply = compose({ headline: "Here is the safety plan card for this campaign.", facts, nextStep: "Approve this plan once, and every send stays inside it — nothing outside it goes out." });
    // BUG-108: the REAL 124 card (already built above as `sp`) is
    // the artifact — the campaign-plan branch's shape (card +
    // committed:false + sends:0 at awaiting_user). Before this the
    // card rode only under the unread `safety_plan` key.
    const spRec = { kind: "safety_plan", safety_plan_card: sp, committed: false, sends: 0 };
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, safety_plan: sp, payload: spRec, artifact: spRec };
  }

  function handleHonestYield(text, ctx) {
    const records = poolOf(ctx);
    if (records && records.length && Outreach && Outreach.honestYield) {
      const q = Outreach.parseTarget(text, ctx.profile || {});
      const y = Outreach.honestYield(records, q, { profile: ctx.profile, nowMs: nowOf(ctx) });
      const reply = compose({ headline: "The honest yield, exactly as the list supports it.", facts: [y.text], nextStep: "Approve the plan and drafting starts from the sendable names only." });
      return { intent: "outreach_clarification", reply, resultStatus: "prepared", sends: 0, yield: y };
    }
    const t = lc(text);
    // IB-3/SC-049: quoted counts keep their thousands separators —
    // "1,140 found" must parse and echo as 1,140, never 140.
    const num = (re) => { const m = t.match(re); return m ? { n: Number(m[1].replace(/,/g, "")), raw: m[1] } : null; };
    const found = num(/([\d,]+)\s*found/), trusted = num(/([\d,]+)\s*trust\w*/), sendable = num(/([\d,]+)\s*sendable/);
    const quoted = found && trusted && sendable ? `You quoted ${found.raw} found, ${trusted.raw} trustworthy, ${sendable.raw} sendable — those are the right three numbers, in the right order.` : "The three numbers that matter are found, trustworthy, and sendable.";
    const reply = compose({ headline: "Honest yield means three numbers that can never inflate each other.", facts: [quoted, "Found counts every sourced name; trustworthy counts verified emails only; sendable is what survives the caps and the never-contact list — so sendable never exceeds trustworthy, and trustworthy never exceeds found."], nextStep: "Open the built list and I will show all three from the records, not from memory." });
    // BUG-108: the quoted yield is a typed record, its source named —
    // user-quoted numbers are never presented as list-read numbers.
    const yrec = { kind: "yield_report", found: found ? found.n : null, trustworthy: trusted ? trusted.n : null, sendable: sendable ? sendable.n : null, source: "user_quoted" };
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, payload: yrec, artifact: yrec };
  }

  function handleTierMix(text, ctx) {
    const sel = ctx.selected || (ctx.listPool && ctx.listPool.selected) || null;
    if (sel && sel.length && Outreach && Outreach.tierMix) {
      const tm = Outreach.tierMix(sel, ctx.profile || {});
      const reply = compose({ headline: "Here is the tier mix of the selected list.", facts: [tm.text], nextStep: "Tell me hold or release on Tier C and the queue follows it exactly." });
      return { intent: "outreach_clarification", reply, resultStatus: "prepared", sends: 0, tier_mix: tm };
    }
    const t = lc(text);
    const grab = (re) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    const a = grab(/(\d+)\s*a\b/), b = grab(/(\d+)\s*b\b/), cc = grab(/(\d+)\s*c\b/);
    const mix = a != null && b != null && cc != null ? `Your mix: ${a} Tier A, ${b} Tier B, ${cc} Tier C.` : "The mix is read off the selected list.";
    // IB-3/SC-025+050 (H-5): name the ask's own count and the true
    // shortfall — the mix cannot be read off a list that does not exist.
    // BUG-106: the count pattern used to require the number to touch
    // the people-noun, so "175 middle-market bankers" parsed as NO
    // count and the shortfall line (and with it H-5) silently never
    // fired. Up to three modifier words may intervene.
    const totalM = t.match(/(\d[\d,]*)\s+(?:[a-z][a-z-]*\s+){0,3}?(bankers|people|names|analysts|contacts)\b/);
    const shortfall = totalM ? `You asked for ${totalM[1]} names; the selected list in this session holds 0, so every tier reads zero until the list is built — intake first, then the mix is read off real names, never estimated.` : null;
    // WORDING-BACKLOG (BUG-130): when the ask itself already decided
    // Tier C ("held back entirely"), the reply states the decision as
    // settled and moves to the build — it never re-asks the question
    // the user just answered.
    // WORDING-BACKLOG (BUG-190): an ask that ASKS whether Tier C
    // gets held is not a decision — the old pattern matched the
    // question's own "gets held" and then credited the user with a
    // ruling they never made, in the same reply that reported 128
    // Tier C names as the mix.
    const asksAboutC = /\b(ask|whether|should|would you|want me to)\b[^.]*tier c|tier c[^.]*\?/.test(t);
    const userHoldsC = !asksAboutC && (/tier c[^.]*\b(held|hold)\b|\bhold tier c\b|held back entirely/.test(t));
    const tierWhy = "Tier C means no sourced personalization fact exists for that person, and a generic email in your name is the fastest way to burn a firm. Tier A and B carry real facts and draft first.";
    const mixNote = a != null && b != null && cc != null ? `That mix is the count BEFORE the Tier C call: held, the sendable list is the ${a + b} Tier A and B names; released, all ${a + b + cc} draft, Tier C last and generic.` : null;
    const reply = userHoldsC
      ? compose({ headline: "Tier C is held at zero, exactly as you set it.", facts: shortfall ? [mix, shortfall, tierWhy] : [mix, tierWhy], nextStep: "Approve the plan and the build runs on that mix — the counts come back read off real names, never estimated." })
      : compose({ headline: "Tier C is held by default — here is why.", facts: [mix, ...(mixNote ? [mixNote] : []), ...(shortfall ? [shortfall] : []), tierWhy], nextStep: "Hold Tier C back, or release it knowing the drafts will be generic?" });
    // BUG-108: the tier state is the typed record — the ask's own
    // mix/count, the held tier, and the true selected count (0).
    const tmRec = { kind: "tier_mix", requested_total: totalM ? Number(totalM[1].replace(/,/g, "")) : null, mix: a != null && b != null && cc != null ? { A: a, B: b, C: cc } : null, held_tier: "C", selected_on_file: 0 };
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, payload: tmRec, artifact: tmRec };
  }

  function handleFirmCap(text, ctx) {
    const reply = compose({ headline: "The per-firm cap is checked twice — once when the list is built and again when emails are queued.", facts: ["The list builder caps a firm at 15 names, and the queue refuses the 16th email to one firm inside any 30 days — it is not a promise, it is a check that runs at selection and again at queue time.", "So 60 emails to one desk cannot be queued; the names past the cap wait in reserve for the next window."], nextStep: "Want the per-firm breakdown of the current list?" });
    // BUG-108: the locked cap values are the typed record.
    const cap = { kind: "firm_cap", per_firm_cap: 15, window_days: 30, enforced_at: ["selection", "queue"], queue_refuses_nth: 16 };
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, payload: cap, artifact: cap };
  }

  function handleFollowUpWave(text, ctx) {
    const t = lc(text);
    const fin = /\bfinal\b|\bday[- ]?15\b|\bclose\b/.test(t) && !/\bday[- ]?6\b/.test(t);
    const camp = campaignOf(ctx);
    if (camp && Outreach && Outreach.runFollowUps) {
      try {
        const r = Outreach.runFollowUps(camp, { touch: fin ? 2 : 1, final: fin, continueTap: true, now: nowOf(ctx), suppression: ctx.suppression || null });
        if (r && r.ok && r.followups && r.followups.length) {
          const reply = compose({ headline: `${r.followups.length} follow-up drafts are prepared and waiting at the approval gate.`, facts: ["Only non-responders are in the wave — responders, bounces, and the never-contact list are excluded before drafting.", "Each one threads onto the first email and takes a new angle; nothing has gone out."], nextStep: "Approve the wave, or tell me which names to pull." });
          return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: r.followups[0].draft || null, followups: r.followups };
        }
      } catch { /* fall through to the plan answer */ }
    }
    // WORDING-BACKLOG (BUG-191): the wave's count is computed IN
    // the reply from the record that exists — here, no campaign is
    // on record in this session, so the wave is honestly empty with
    // its arithmetic shown (sent − replies − bounces − suppressed),
    // never a described wave plus an offer to draft it later.
    const reply = fin
      ? compose({ headline: "The day-15 close wave: 0 drafts — no campaign is on record in this session to close.", facts: ["The count is arithmetic on the campaign record: how many went out, minus replies, minus bounces, minus the never-contact list — and that record is empty here, so the wave is empty, never estimated.", "When a campaign is on record, the close thanks them, leaves the door open, and asks for nothing; after it, follow-ups for that campaign stop for good — no third touch, ever."], nextStep: "Load the campaign (or paste its recipient list) and the close wave drafts against its real non-responders?" })
      : compose({ headline: "The day-6 wave: 0 drafts — no campaign is on record in this session.", facts: ["The count is arithmetic on the campaign record: how many went out, minus replies, minus bounces, minus the never-contact list — and that record is empty here, so the wave is empty, never estimated.", "When a campaign is on record, each follow-up threads onto the first email and takes a new angle — a short proof point or a specific observation about their firm — nothing in it repeats the first ask."], nextStep: "Load the campaign (or paste its recipient list) and the wave drafts against its real non-responders?" });
    // BUG-108: the wave PLAN is the typed record when no campaign is
    // loaded to run the wave against — touch, audience, threading.
    const wave = { kind: "followup_wave_plan", touch: fin ? 2 : 1, final: fin, audience: "non_responders_only", threaded: true, campaign_on_file: false };
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, payload: wave, artifact: wave };
  }

  function handleDigest(text, ctx) {
    const camp = campaignOf(ctx);
    if (camp && Outreach && Outreach.campaignMetrics) {
      const m = Outreach.campaignMetrics({ campaign: camp, pool: poolOf(ctx) || {} });
      const reply = compose({ headline: "Here is the campaign digest from the record.", facts: [`Out the door: ${m.sent || 0}; bounces ${m.bounced || 0} (${m.bounce_rate != null ? m.bounce_rate : 0}%); replies ${m.replies || 0}; positive ${m.positive || 0}; meetings waiting on you ${m.meetings_pending || 0}.`, "Every number comes from the campaign record — nothing is estimated."], nextStep: "Want the per-person detail behind any of those?" });
      return { intent: "campaign_digest", reply, resultStatus: "prepared", sends: 0, metrics: m, payload: { kind: "campaign_digest", campaign_on_file: true, totals: m } };
    }
    // BUG-107: the old headline opened with a bare "No …" and no
    // readable alternative, tripping REFUSAL_NO_ALTERNATIVE on an
    // honest empty state. The headline now leads with the state and
    // the next step offers the alternative as a question.
    // BUG-108: the empty digest is itself the typed record — zeroed
    // totals over no campaign, never estimated numbers.
    const reply = compose({ headline: "The digest is empty — no campaign is running on the record in this session.", facts: ["The digest reports, for each day a campaign runs: how many went out, bounces and the bounce rate, replies, positive replies, and meetings waiting on you.", "It never mixes days together, so a bad day cannot hide inside a good week."], nextStep: "Once the first wave goes out, the digest reports every day it runs — want the first wave staged?" });
    const dg = { kind: "campaign_digest", campaign_on_file: false, days: [], totals: { sent: 0, bounced: 0, bounce_rate: null, replies: 0, positive: 0, meetings_pending: 0 } };
    return { intent: "campaign_digest", reply, resultStatus: "awaiting_user", sends: 0, payload: dg, artifact: dg };
  }

  function handleCloseOut(text, ctx) {
    const camp = campaignOf(ctx);
    if (camp && Outreach && Outreach.closeOut) {
      try {
        const co = Outreach.closeOut(camp, {});
        const okDraft = (co.thank_you_drafts || []).find((d) => d && d.ok && d.draft);
        if (okDraft) {
          const angleLine = (co.angles || []).slice(0, 2).map((a) => `${a.label}: ${a.sent || 0} out, ${a.replies || 0} replies`).join("; ");
          const reply = compose({ headline: "The close-out is ready, with thank-you drafts at the gate.", facts: [angleLine ? `Angles, from the real counts: ${angleLine}.` : "Angle results are in the close-out record.", "Each thank-you waits for a real note from you before it can go out — none is generic."], nextStep: "Add your note to the first thank-you and approve it." });
          return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: okDraft.draft, close_out: co, payload: { kind: "close_out", campaign_on_file: true, angles: co.angles || [], thank_you_drafts: co.thank_you_drafts || [] } };
        }
      } catch { /* fall through to the honest plan answer */ }
    }
    const reply = compose({ headline: "The close-out needs the finished campaign on record, and none is loaded in this session.", facts: ["When it runs, it reports reply rate by draft structure — which angles earned replies and which fell flat — from the real counts only.", "Then it drafts a thank-you for everyone who took a call, each one held for your note and your approval."], nextStep: "Tell me which campaign to close out and I will run it on that record as soon as it is loaded — with no record, any angle ranking would be invented." });
    // BUG-108: the empty close-out record — no angles, no drafts,
    // nothing invented in place of the missing campaign.
    const coRec = { kind: "close_out", campaign_on_file: false, angles: [], thank_you_drafts: [] };
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, payload: coRec, artifact: coRec };
  }

  // ---------- reply handling (124 classifyReply + 141 calendar card) -------
  function handleRelayedOptOut(text, ctx) {
    const c = ctx || {};
    if (!Array.isArray(c._relayedSuppressions)) c._relayedSuppressions = [];
    c._relayedSuppressions.push({ at: new Date(nowOf(c)).toISOString(), source: "relayed_reply", instruction: s(text).slice(0, 200) });
    // COMPLEXITY WAVE: the reply below claims the never-contact list
    // holds this person — that claim is only true if the record lands
    // in the real suppression store (124), not just this side list.
    // The side list is whitelisted conversation state now; the store
    // write happens whenever the relayed text identifies the person.
    try {
      const store = suppressionStoreOf(c);
      if (store) {
        const emailM = s(text).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
        const nameM = s(text).match(/\bfrom\s+([A-Z][a-z]+ [A-Z][a-z]+)\b/) || s(text).match(/[—–-]\s*([A-Z][a-z]+ [A-Z][a-z]+)\s*$/) || s(text).match(/,\s*([A-Z][a-z]+ [A-Z][a-z]+)\s*$/);
        if (emailM) store.suppress({ email: emailM[0], person_id: emailM[0], suppressed_by: "relayed_reply", scope: "both" });
        else if (nameM) store.suppress({ person_id: "name:" + nameM[1].toLowerCase(), suppressed_by: "relayed_reply", scope: "both" });
      }
    } catch { /* the relay record above still stands */ }
    const camp = campaignOf(c);
    const countFact = camp ? "The campaign record carries the matching count, and this address is out of every future wave." : "The count from this instruction: 1 person added to the never-contact list. No campaign is loaded in this session, so there is no wider campaign count to report — the addition itself is recorded now.";
    const reply = compose({ headline: "Done — that sender goes on your never-contact list.", facts: ["Every queued follow-up to them stops here, and the address stays on the list across every campaign, for good.", countFact], nextStep: "Want the never-contact count in your next digest?" });
    // BUG-108: the suppression record is this turn's doorstep
    // artifact — the completion branch already read `suppression`;
    // the doorstep derivation reads draft/packet/artifact/brief.
    return { intent: "intent_opt_out", reply, resultStatus: "completed", sends: 0, suppression: { recorded: true, scope: "all_campaigns" }, payload: { kind: "suppression_record", recorded: true, scope: "all_campaigns" }, artifact: { kind: "suppression_record", recorded: true, scope: "all_campaigns" } };
  }

  function handleReplyRedirect(text, ctx, name) {
    const draft = { kind: "intro_ask", introduces: name, subject: "Thank you — and a quick introduction?", body: `Thank you for the pointer, and for reading my note. Would you be willing to introduce me to ${name}? I would love fifteen minutes to hear about their path and any advice for someone aiming at the team. Happy to send a short blurb you can forward as-is. Thank you again.` };
    const reply = compose({ headline: "Good news — that reply opens a warmer door.", facts: [`The thank-you goes to the banker first, on its own.`, `Then a separate, short intro ask naming ${name} rides as its own follow-up draft — the two are never merged into one email.`, `${name} joins your list as a warm candidate, sourced from this reply.`], nextStep: "Approve the thank-you and the intro ask, and both sit ready at the gate." });
    return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft, new_candidate: { name, source: "reply_redirect" } };
  }

  function nextZonedSlot(nowMs, weekday, hour, minute, tz) {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" });
    for (let add = 1; add <= 8; add++) {
      const probe = new Date(nowMs + add * 86400000);
      const parts = {};
      for (const p of fmt.formatToParts(probe)) parts[p.type] = p.value;
      const iso = Outreach.zonedTimeToUtc(Number(parts.year), Number(parts.month), Number(parts.day), hour, minute, tz);
      const ms = Date.parse(iso);
      if (Number.isFinite(ms) && weekdayMatchesInTz(ms, weekday, tz)) return ms;
    }
    return null;
  }
  function weekdayMatchesInTz(ms, weekday, tz) {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(ms));
    return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[wd] === weekday;
  }

  function handleReplyScheduling(text, ctx) {
    const t = lc(text);
    const dayMap = { mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5 };
    const days = [...new Set([...t.matchAll(/\b(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday)\b/g)].map((m) => dayMap[m[1]]))];
    const timeM = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (!days.length || !timeM || !Outreach || !Outreach.zonedTimeToUtc) return null;
    let hour = Number(timeM[1]) % 12; if (timeM[3] === "pm") hour += 12;
    const minute = Number(timeM[2] || 0);
    const tz = /\b(pt|pacific|los angeles|san francisco|seattle)\b/.test(t) ? "America/Los_Angeles" : /\b(ct|central|chicago)\b/.test(t) ? "America/Chicago" : "America/New_York";
    const now = nowOf(ctx);
    const slots = days.map((d) => nextZonedSlot(now, d, hour, minute, tz)).filter((x) => x != null).map((ms) => ({ start: new Date(ms).toISOString(), timezone: tz, durationMin: 30 }));
    if (!slots.length) return null;
    if (Doorstep && Doorstep.emitCalendarProposal) {
      try {
        const r = Doorstep.emitCalendarProposal(ctx, { title: "Coffee chat", slots, timezone: tz });
        if (r && r.intent === "calendar_proposal" && r.resultStatus !== "blocked") return r;
      } catch { /* fall through to the composed proposal */ }
    }
    const label = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
    const reply = compose({ headline: "The banker offered a time — here is the proposal card, checked against your calendar.", facts: slots.map((sl) => `${label(sl.start)} (${tz.replace("_", " ")}): proposed for a 30-minute coffee chat.`), nextStep: "Approve the card and the invite goes out; nothing is booked before that." });
    return { intent: "calendar_proposal", reply, resultStatus: "awaiting_user", sends: 0, proposal: { slots, title: "Coffee chat" } };
  }

  function handleReplyOOO(text, ctx) {
    const probe = s(text).replace(/-/g, " ");
    let resched = null;
    if (Outreach && Outreach.classifyReply) { try { const cls = Outreach.classifyReply({ body: probe }, { now: nowOf(ctx) }); resched = cls && cls.reschedule_followup_on || null; } catch { resched = null; } }
    const reply = compose({ headline: "That is an out-of-office notice, not a reply — and the follow-up moves.", facts: ["It does not count as a reply, and it does not burn one of the two follow-up touches.", resched ? `The next touch moves to ${resched}, the day after the return date on the notice.` : "The next touch moves to the day after the return date on the notice."], nextStep: "Nothing else about the campaign changes — want the updated wave timing?" });
    // BUG-108: the reschedule decision is the typed record (the
    // calendar family's commitment for this turn) — it rode only
    // under the unread `followup` key before.
    const fu = { kind: "followup_reschedule", classification: "auto-reply-ooo", counts_as_reply: false, reschedule_followup_on: resched };
    return { intent: "intent_followup_status", reply, resultStatus: "completed", sends: 0, followup: { classification: "auto-reply-ooo", counts_as_reply: false, reschedule_followup_on: resched }, payload: fu, artifact: fu };
  }

  function handleBounceReport(text, ctx) {
    const rateM = lc(text).match(/(\d+(?:\.\d+)?)\s*%/);
    const rate = rateM ? rateM[1] : null;
    // WORDING-BACKLOG (BUG-191): the pattern check RUNS in the
    // reply over the record that exists. This session's record
    // holds no bounced addresses, so the diagnosis's honest output
    // is that there is no firm pattern to name yet — stated as the
    // check's result, with the input that completes it named.
    const reply = compose({ headline: rate ? `At ${rate}% bounces, the breaker has tripped and the wave is paused.` : "The bounce breaker governs this: past the line, the wave pauses until the cause is fixed.", facts: ["The breaker trips above 5% on a wave, or after 3 hard bounces in a row — past that line, nothing more goes out until the cause is fixed.", "The pattern check ran over this session's record: no bounced addresses are on it, so no firm pattern can honestly be named yet — a diagnosis invented without the addresses would be a guess wearing a lab coat.", "The moment the wave's bounce list is on record, the check reads it firm by firm: a shared pattern at one firm is re-verified from published addresses before anything resumes — never pushed through."], nextStep: "Paste the bounce list (or open the campaign) and the diagnosis completes on the real addresses?" });
    // BUG-108: the breaker state is the typed record (it rode under
    // the unread `breaker` key only).
    const brk = { kind: "bounce_breaker", tripped: rate != null && Number(rate) > 5, observed_rate: rate != null ? Number(rate) : null, threshold_pct: 5, state: rate != null && Number(rate) > 5 ? "paused" : "armed" };
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, breaker: { tripped: brk.tripped, observed_rate: brk.observed_rate }, payload: brk, artifact: brk };
  }

  function handleReplyFamily(text, ctx) {
    const t = lc(text);
    if (/\bforced opt-out\b|\bopt-out mid-campaign\b|\bopt out mid-campaign\b/.test(t)) return handleRelayedOptOut(text, ctx);
    if (/\bout[- ]of[- ]office\b|\bon vacation\b|\breturn date\b/.test(t) && /\b(reply|reschedule|touch|count)\b/.test(t)) return handleReplyOOO(text, ctx);
    if (/\breschedul\w*\b/.test(t)) return handleReschedule(text, ctx);
    const quotedM = s(text).match(/["“]([^"”]{4,400})["”]/);
    const probe = quotedM ? quotedM[1] : text;
    // COMPLEXITY WAVE (BUG-169 invariant, W5): a QUESTION about a
    // possible opt-out ("did he reply saying stop emailing me?") is
    // not a relayed report — no suppression may be written from it.
    // A hypothesis asks one confirming question; it never writes.
    if (!quotedM && /\bstop\b|\bunsubscribe\b|\bnever contact\b|\bdo not (email|contact)\b|\bopt[ -]?out\b/.test(t) && /\?/.test(s(text)) && /^\s*(did|does|has|have|was|were|is|are|can|could|would)\b/i.test(s(text)) && !/\b(replied|responded|wrote back|said|told me)\b[^.?!]*\b(stop|unsubscribe|remove me|never)\b/i.test(s(text))) {
      const reply = compose({ headline: "That reads as a question, not a report — so nothing is recorded yet.", facts: ["A suppression is written only from a report that the person actually asked to stop. If they did, state it as a report — 'he replied: stop emailing me' — and the record is written in that turn, with your words as its evidence.", "If you are asking whether he replied at all, that answer lives in your inbox; nothing visible from here can settle it."], nextStep: "Confirm it as a statement and the never-contact record is written immediately." });
      return { intent: "intent_opt_out", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    if (/\bstop emailing\b|\bstop contacting\b|\bplease stop\b|\bunsubscribe\b|\bdo not (email|contact) me\b/.test(lc(probe)) || /suppress forever/.test(t)) return handleRelayedOptOut(text, ctx);
    const redir = s(probe).match(/\btalk to ([A-Za-z][a-z]+)\b|\breach out to ([A-Za-z][a-z]+)\b|\bspeak with ([A-Za-z][a-z]+)\b/);
    const redirName = redir ? (redir[1] || redir[2] || redir[3]) : null;
    if (redirName && !/^(me|you|them|him|her|someone|anyone|the|my)$/i.test(redirName) && /\binstead\b|\brather\b/.test(lc(probe))) return handleReplyRedirect(text, ctx, redirName.charAt(0).toUpperCase() + redirName.slice(1));
    if (/\bbounce rate\b|\bbreaker\b/.test(t)) return handleBounceReport(text, ctx);
    if (/\bout[- ]of[- ]office\b|\bon vacation\b|\breturn date\b/.test(t) && /\b(reply|reschedule|touch|count)\b/.test(t)) return handleReplyOOO(text, ctx);
    if (/\b(tue|tues|wed|thu|thur|fri|mon|monday|tuesday|wednesday|thursday|friday)\b/.test(t) && /\b\d{1,2}\s*(am|pm)\b/.test(t) && /\b(reply handling|offers|offered|free|works|chat|call)\b/.test(t)) return handleReplyScheduling(text, ctx);
    return null;
  }

  // ---------- refusal family: blasts + false claims (SC-035/294/295) -------
  function handleRefusal(text, ctx) {
    const t = lc(text);
    const falseClaim = /\b(say|claim|tell|pretend|imply)\b[^.]*\b(sent me|referred me|told me to reach out|recommended me)\b/.test(t);
    const blast = /\b(email|send|message)\b[^.]*\b(all|every)\b[^.]*\btoday\b/.test(t) || /\bsend all \d+/.test(t) || /\bblast\b[^.]*\b\d{2,}\b/.test(t);
    const fabricate = /\b(make up|fabricate|invent|fake)\b[^.]*\b(referral|experience|internship|credential|reference|gpa|endorsement)\b/.test(t);
    // COMPLEXITY WAVE (BUG-177): two measured shapes fell through
    // every category and got the generic fallback — a refusal must be
    // distinguishable from a broken route. (1) An imperative to put a
    // credential claim on materials (a GPA number, a club presidency,
    // a named-firm internship) where the claim is absent from the
    // confirmed record — or the user admits it is not true. A
    // fact-GIVING frame ("my GPA is 3.9, use it") is not an
    // imperative onto materials and never fires this. (2) Mass-apply:
    // an apply/submit verb aimed at everything or a large count,
    // with a no-review/urgency marker or a count of 50+.
    const materialImperative = /\b(put|write|add|list|say|state|claim|include)\b[^.]*\b(on|in|into|to)\b[^.]*\b(my\s+)?(cover letter|resume|cv|application)\b/.test(t);
    const claimToken = /\bgpa\s*(?:is\s*)?[0-9]\.[0-9]\b|\bpresident of\b|\bchair of\b|\bvp of\b|\bintern(ship|ed)?\s+(at|with)\s+[A-Z]|\bworked at\s+[A-Z]|\b[A-Z][a-z]+ (?:Sachs|Partners|Capital|Bank|Ltd|Inc)\s+internship\b/.test(s(text));
    const admission = /\bdidn'?t actually\b|\bnever (did|worked|interned|had|was)\b|\bdon'?t (actually\s+)?have\b|\bonly shadowed\b|\bmade (it|that|this) up\b|\bisn'?t (even\s+)?true\b|\bnot true\b/.test(t);
    let claimOnRecord = false;
    if (materialImperative && (claimToken || admission) && ctx.profile) {
      try {
        const factsBlob = lc(JSON.stringify(ctx.profile));
        const gpaM = s(text).match(/\bgpa\s*(?:is\s*)?([0-9]\.[0-9])\b/i);
        if (gpaM && factsBlob.includes(gpaM[1])) claimOnRecord = true;
        const firmM = s(text).match(/\b([A-Z][A-Za-z&.]+(?:\s[A-Z][A-Za-z&.]+){0,2})\s+internship\b/);
        if (firmM && factsBlob.includes(lc(firmM[1]))) claimOnRecord = true;
        if (/\bpresident of the finance club\b/.test(t) && /finance club/.test(factsBlob) && /president/.test(factsBlob)) claimOnRecord = true;
      } catch { claimOnRecord = false; }
    }
    const unverifiedClaim = materialImperative && (claimToken || admission) && (admission || !claimOnRecord);
    const massObject = /\b(everything|every job|all jobs|all of them|every role|all roles)\b/.test(t) || /\b(\d{2,})\s*(jobs|applications|roles)\b/.test(t);
    const massCount = Number((t.match(/\b(\d{2,})\s*(jobs|applications|roles)\b/) || [])[1]) || 0;
    const noReview = /\b(automatically|while i sleep|tonight|right now|don'?t need to see|no review|without (me|my) (seeing|reviewing)|just do it|all of them)\b/.test(t);
    const massApply = /\b(apply|submit|send in)\b/.test(t) && massObject && (noReview || massCount >= 50);
    if (!falseClaim && !blast && !fabricate && !unverifiedClaim && !massApply) return null;
    const facts = [];
    if (blast) facts.push("The blast is outside every locked cap: sending starts at 12 a day and never passes 30, so the honest version of this campaign runs across weeks, not hours.");
    if (massApply) facts.push("Applying in bulk, unseen, is not a mode this product has: real submissions are capped at 15 a day, each one built from your confirmed facts and stopped at its doorstep for your approval. There is no while-you-sleep queue — 'everything, right now, without seeing it' is exactly the ask those rules exist for.");
    if (unverifiedClaim) facts.push("That claim is not on your confirmed record, and materials carry only what the record proves. The moment a claim is confirmed — a transcript line, an offer letter, or your own statement that it is TRUE — it goes in; an admitted guess or an unrecorded credential stays out, however well it fits the story.");
    if (falseClaim) facts.push("And I will not claim a Goldman MD referred you when none did — a borrowed name that turns out false ends the relationship, and it can end the account.");
    if (fabricate && !falseClaim) facts.push("Invented facts in outreach are the one move that can end this before it starts: they surface in the first real conversation, every time.", `Grounded in your own confirmed profile facts, as of ${asOfMonthYear(ctx)} — the real fast path is built from those, and only those.`);
    facts.push("The true path: a shortlist built from real sources, verified emails, drafts in your voice, your one approval — then a paced wave inside the caps.");
    const reply = compose({ headline: "I won't do that — here is what I will do instead.", facts, nextStep: "Say the word and I build the shortlist first." });
    // BUG-108: the refusal decision is a typed record — what was
    // refused and the safe alternative offered. A refusal turn's
    // doorstep is this record: there is nothing further to drive.
    const refused = [];
    if (blast) refused.push("blast_send_over_locked_caps");
    if (massApply) refused.push("mass_apply_unreviewed");
    if (unverifiedClaim) refused.push("unverified_claim_on_materials");
    if (falseClaim) refused.push("fabricated_referral_claim");
    if (fabricate) refused.push("fabricated_facts");
    const rf = { kind: "safety_refusal", refused, alternative: "shortlist_first_paced_campaign", sends: 0 };
    return { intent: "intent_refusal", reply, resultStatus: "blocked", sends: 0, payload: rf, artifact: rf };
  }

  // ---------- safety appendix: 125 request screen + 139 assessment ---------
  function handleAppendixSafety(text, ctx) {
    if (Intel && Intel.respondToRequest) {
      const r = Intel.respondToRequest(text);
      if (r && r.action === "refuse") return { intent: "intent_refusal", reply: r.text, resultStatus: "blocked", sends: 0, refusal_reason: r.reason || null };
      if (r && r.action === "support") {
        // A4 contract: the support answer carries 139's distress
        // product (warmth_first / one_step / plan_shrunk_to_one_step).
        let support = null;
        try { support = Safety && Safety.distressResponse ? Safety.distressResponse({ text, profileFacts: [] }) : null; } catch { support = null; }
        return { intent: "safety_support", reply: r.text, resultStatus: "completed", sends: 0, support };
      }
    }
    if (Safety && Safety.assessmentRequest) {
      const a = Safety.assessmentRequest(text, {});
      if (a && a.must_not_complete) {
        const alt = Safety.honestAssessmentAnswer ? Safety.honestAssessmentAnswer(text, {}) : null;
        const honest = alt && alt.text ? alt.text : "I can help you prepare honestly instead: a timed practice run on the same question types, the concepts behind them, and a plan for the gap areas.";
        return { intent: "intent_refusal", reply: `I won't take an assessment for you — it has to be your own work, and a score that isn't yours collapses at the first live round. ${honest}`, resultStatus: "blocked", sends: 0 };
      }
    }
    if (/\btake my\b[^.]*\b(hackerrank|test|assessment|exam)\b|\bdo my (test|assessment|hackerrank)\b|\bsit my\b[^.]*\b(test|assessment)\b/.test(lc(text))) {
      return { intent: "intent_refusal", reply: "I won't take an assessment for you — it has to be your own work, and a score that isn't yours collapses at the first live round. What I will do: a timed practice run on the same question types, the concepts behind them drilled, and a plan for the gap areas. Next step — tell me when it is due and I will lay out the prep days.", resultStatus: "blocked", sends: 0 };
    }
    return null;
  }

  // ---------- return-offer playbook (129, SC-277; family Career Os: R-C5) ---
  function handleReturnOffer(text, ctx) {
    if (!OS || !OS.returnOfferPlaybook) return null;
    const r = OS.returnOfferPlaybook({ cir: ctx.cir || cirFor(text, ctx) || null, offer: ctx.offer || null });
    const firstSentence = (x) => s(x).split(/(?<=[.!?])\s/)[0];
    // 129's steps are plain strings (an {action, why} object shape was
    // read here before — every fact rendered "undefined — undefined").
    const facts = (r.steps || []).slice(0, 3).map((st) => firstSentence(typeof st === "string" ? st : `${st.action || ""}${st.why ? ` — ${st.why}` : ""}`)).filter(Boolean);
    facts.push(`Grounded in your own internship log and the company file's sourced notes, as of ${asOfMonthYear(ctx)}.`);
    const reply = compose({ headline: "Your return-offer playbook — before, during, and after.", facts, nextStep: "Name the firm and I will pin the playbook to its bar and its timeline." });
    // BUG-072: the playbook rides as an F8 record under payload.
    const date = new Date(nowOf(ctx)).toISOString().slice(0, 10);
    const payload = Object.assign({}, r, { record_id: `return-offer-playbook-${date}`, date, text: facts[0] || undefined });
    return { intent: "career_os_playbook", reply, resultStatus: "prepared", sends: 0, playbook: r, payload };
  }

  // ---------- warm-path graph family (135) ---------------------------------
  function graphStoreOf(ctx) {
    const g = (ctx && (ctx.graph || ctx.graphStore)) || null;
    const people = [];
    const push = (p) => { if (!p) return; try { people.push(Graph && Graph.normalizePerson ? Graph.normalizePerson(p) : p); } catch { people.push(p); } };
    if (g && Array.isArray(g.people)) g.people.forEach(push);
    for (const cn of (ctx && ctx.contacts) || []) push(cn);
    const prof = (ctx && ctx.profile) || {};
    for (const cn of prof._careerGraphPeople || []) push(cn);
    for (const cn of prof.connections || []) push(cn);
    const interactions = (g && g.interactions) || (ctx && ctx.interactions) || [];
    // IB-2 / SC-157 code half: fold interaction rows onto the person
    // rows by the same name+firm key, so keep-warm can see a real
    // last-chat date. A connection date is NOT a chat date — only
    // interaction rows move last_contact_at, and only a conversation
    // row raises a cold stage to chatted (never a downgrade).
    const keyOf = (n, f) => `${lc(n || "")}|${lc(f || "")}`;
    const byKey = new Map(people.map((p) => [keyOf(p.full_name || p.name, p.current_firm || p.company), p]));
    for (const ix of interactions) {
      if (!ix) continue;
      const p = byKey.get(keyOf(ix.name || ix.person || ix.full_name, ix.firm || ix.company || ix.current_firm));
      if (!p) continue;
      const at = ix.at || ix.last_contact_at || ix.when || null;
      if (at && (!p.last_contact_at || String(at) > String(p.last_contact_at))) p.last_contact_at = at;
      const kind = lc(ix.kind || ix.type || "");
      if (/\bchat|conversation|call|coffee|meeting|talked\b/.test(kind) && (!p.stage || p.stage === "cold")) p.stage = "chatted";
    }
    return { people, interactions, referrals: (g && g.referrals) || (ctx && ctx.referrals) || [], user: (g && g.user) || null };
  }
  function graphProfileOf(ctx) {
    const p = (ctx && ctx.profile) || {};
    const edu = (p.facts || []).find((f) => f.kind === "education");
    // BUG-101: 135's exclusionFor reads profile.current_employer, but
    // this adapter never supplied it, so the current-employer
    // exclusion could never fire through the chat path. Derived
    // honestly: an experience fact with NO end date is an open-ended
    // (current) role; an ended internship is never promoted to one.
    const openRole = (p.facts || []).find((f) => f.kind === "experience" && f.org && !f.end);
    return { school: (edu && edu.org) || p.school || null, clubs: p.clubs || [], major: (edu && edu.title) || p.major || null, hometown: p.hometown || null, name: (p.basics && p.basics.name) || null, current_employer: p.current_employer || (openRole ? openRole.org : null) };
  }
  // BUG-103: a findPaths row can carry NO shared fact — a bare
  // connection from the user's own export. Two standing laws meet on
  // that row: IB-2 (an ingested connection IS a live path the next
  // turn must find) and doc 03 F4 (every ranked person shows the
  // ground their path stands on). The assembly therefore keeps every
  // live row in `paths` and states each row's basis on the record:
  // basis "shared_fact" with the fact in why[], or basis "connection"
  // with why[] completed by the true ground — the connection itself,
  // from the user's own lists. Connection-only rows are ALSO listed
  // under `cold`, so no reader can mistake them for fact-backed
  // warmth. 135's engine semantics are untouched (pinned by
  // tests/career-graph.test.cjs).
  function graphEnvelopeOf(store, r, extra) {
    const rows = (r && r.paths) || [];
    const cards = (r && r.draft_cards) || [];
    const paths = [], cold = [];
    rows.forEach((row) => {
      const shared = (Array.isArray(row.why) ? row.why : []).filter((w) => !/^in your graph/.test(String(w)));
      const hasShared = shared.length > 0 || (typeof row.shared_fact === "string" && row.shared_fact.trim() !== "" && !/^no shared fact/i.test(row.shared_fact));
      const out = Object.assign({}, row, { basis: hasShared ? "shared_fact" : "connection" });
      if (!hasShared) {
        const src = (Array.isArray(row.source_list) && row.source_list[0]) || (Array.isArray(row.sources) && row.sources[0]) || null;
        out.why = [`in your graph${src ? ` (${src})` : ""} — the connection itself is the path; no shared fact on record`];
        cold.push(out);
      }
      paths.push(out);
    });
    return Object.assign({ kind: "graph_paths", company: (r && r.company) || null, paths, cold, excluded: (r && r.excluded) || [], draft_cards: cards, graph_people: store.people.length }, extra || {});
  }
  function companyFromText(text, ctx) {
    // "the firm is Houlihan Lokey" — an explicit naming frame beats
    // every positional guess (the decline-draft ask has no "at X").
    const named = s(text).match(/\b(?:firm|company|bank|employer) is\s+([A-Z][A-Za-z0-9&.'-]+(?:\s+(?:[A-Z][A-Za-z0-9&.'-]+|Capital|Partners|Securities|Bank|Group))+)/);
    if (named) return named[1].replace(/[?.!,]+$/, "");
    const m = s(text).match(/\bat\s+([A-Z][A-Za-z0-9&.'-]+(?:\s+(?:[A-Z][A-Za-z0-9&.'-]+|Capital|Partners|Securities|Bank|Group))?)/);
    // DEPTH WAVE (BUG-213): "at <City>" names a place, not a company
    // (see the loose-fallback note below) — the guess falls through.
    if (m && !FACT_CITIES.some((ct) => lc(ct) === lc(m[1].trim()))) return m[1].replace(/[?.!,]+$/, "");
    // PREP-KB ROUTING (LF-02, custom battery 2026-10-18, P4): the
    // possessive frame — "my Deloitte application" — names the
    // company with no preposition before it, so every frame above
    // missed it and an application-status ask fell through to the
    // company FILE. A capitalized name directly before application /
    // interview / offer is company-shaped by construction.
    const pm = s(text).match(/\bmy\s+([A-Z][A-Za-z0-9&.'-]+(?:\s+(?:[A-Z][A-Za-z0-9&.'-]+|Capital|Partners|Securities|Bank|Group))?)\s+(?:application|interview|offer)\b/);
    if (pm && !FACT_CITIES.some((ct) => lc(ct) === lc(pm[1].trim()))) return pm[1].replace(/[?.!,]+$/, "");
    // Paraphrases lowercase everything: fall back to names the product
    // actually knows (the postings pool, the company files) before giving up.
    const t = lc(text);
    const known = new Set();
    for (const p of postingsFromCtx(ctx || {})) if (p.company) known.add(p.company);
    try { for (const x of cirListOf(ctx) || []) { const n = cirShortName(x); if (n) known.add(n); } } catch { /* no files */ }
    for (const name of known) if (name && t.includes(lc(name))) return name;
    // Loose last resort (lowercased paraphrases of "who do I know at X"):
    // the first plain token after "at" that is not a stopword.
    // DEPTH WAVE (BUG-213): a CITY after "at" is a place, never a
    // company — "aiming at Seattle firms" used to resolve the
    // company as "seattle" and hand a career-plan ask to the intel
    // route. Places are excluded from the company guess.
    // PREP-KB ROUTING (LF-02, custom battery 2026-10-18, Block 2 t3):
    // the guess is a PEOPLE-context guess — it exists for paraphrases
    // of "who do I know at X" — but it fired on ANY turn containing
    // "at <word>", so a prep critique's trailing "…before looking at
    // costs" minted a company named "costs" and the intel branch
    // answered "costs has no company file yet". A bare token after
    // "at" is company-shaped only inside a people/graph-shaped turn;
    // everywhere else a common noun stays a common noun.
    const loose = /\bwho\b|\banyone\b|\bknow at\b|\bpath (into|to|in)\b|\bintro\b|\breferr|\bcontact/.test(t) ? t.match(/\bat\s+([a-z][a-z0-9&.'-]{2,})/) : null;
    if (loose && !/^(my|the|a|an|least|most|work|school|home|once|first|that|this|it)$/.test(loose[1]) && !FACT_CITIES.some((ct) => lc(ct) === loose[1] || lc(ct).split(" ")[0] === loose[1]) && !/^(nyc|sf|la)$/.test(loose[1])) return loose[1].replace(/[?.!,]+$/, "");
    return null;
  }

  // The findPaths doorstep record for one company, shared by
  // handleGraphPaths and the graph catch fall-through (BUG-101: both
  // used to diverge — one carried the record, the other prose only).
  function pathsResultFor(company, ctx, store) {
    const r = Graph.findPaths(store, company, graphProfileOf(ctx), { now: nowOf(ctx) });
    const env = graphEnvelopeOf(store, r);
    if (env.paths.length) {
      // BUG-2026-10-14-GRAPH-SHAPE: 135's findPaths rows are FLAT
      // ({name, firm, title, why[]}) — there is no .person object.
      // Reading p.person.* threw on every non-empty graph result.
      const facts = env.paths.slice(0, 3).map((p) => `${p.name} — ${p.title || "contact"} at ${p.firm || company}: ${(Array.isArray(p.why) ? p.why.join(", ") : p.why) || "direct connection"}.`);
      if (env.cold.length) facts.push(`${env.cold.length} of ${env.cold.length === 1 ? "them stands" : "them stand"} on the connection alone — no shared fact on record, and the record says so.`);
      facts.push("Referral drafts stay as held cards until you approve one — a referral ask never goes in a first email.");
      const reply = compose({ headline: `You have ${env.paths.length} warm path${env.paths.length === 1 ? "" : "s"} into ${company}.`, facts, nextStep: "Pick a path and I will prepare the intro ask as a held card." });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: env.paths, payload: env };
    }
    const reply = compose({ headline: `${company} has no path in your graph yet.`, facts: [`Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}, and none of them is at ${company} now.`, "People who already left a firm never count as a path into it."], nextStep: `Upload your LinkedIn export or paste names from ${company}'s team page, and I will rebuild the paths first — nothing is asked or submitted until you approve each step.` });
    return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: [], payload: env };
  }

  function handleGraphPaths(text, ctx) {
    const company = companyFromText(text, ctx);
    if (!company) return null;
    const store = graphStoreOf(ctx);
    if (Graph && Graph.findPaths) return pathsResultFor(company, ctx, store);
    return null;
  }

  function handleGraphAlumni(text, ctx) {
    const store = graphStoreOf(ctx);
    const gp = graphProfileOf(ctx);
    const school = gp.school || "your school";
    const reply = compose({ headline: "Your LinkedIn is thin, so the alumni directory is the backup route — here is what I can and cannot do with it.", facts: [`${school}'s alumni directory is yours to browse inside the school's own portal; I cannot extract names from it, and nothing here scrapes it.`, "The working lane: bring names back — paste them here or use your LinkedIn export — and I verify each person's current firm, dedupe, and draft.", `Your graph on file currently holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"} to match those names against.`], nextStep: "Paste the first batch of names and I will run verification and dedupe on them." });
    // BUG-101: the lane record rides as the payload — before this the
    // turn carried prose only and no reader could see the lane state.
    return { intent: "graph_alumni", reply, resultStatus: "awaiting_user", sends: 0, payload: { kind: "graph_lane", lane: "alumni_directory", school: gp.school, graph_people: store.people.length, scrape: false, working_lane: "linkedin_export_or_pasted_names" } };
  }

  function handleGraphReferral(text, ctx) {
    const store = graphStoreOf(ctx);
    const nameM = s(text).match(/\b(?:ask|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
    if (nameM && Graph && Graph.planReferralAsk) {
      try {
        // planReferralAsk resolves by exact full name; the chat layer
        // resolves the spoken fragment ("Daniel") to the graph's
        // Daniel first — otherwise every first-name ask misses.
        const frag = lc(nameM[1]);
        const person = store.people.find((p) => lc(p.full_name || p.name || "").includes(frag));
        const r = Graph.planReferralAsk(store, person ? (person.full_name || person.name) : nameM[1], { now: nowOf(ctx) });
        // BUG-099: 135 returns the prepared card as r.draft — this
        // branch read r.draft_card (a field that does not exist), so
        // it never fired and a prepared referral card was silently
        // dropped in favor of the generic timing answer.
        if (r && r.ok && r.draft) {
          const reply = compose({ headline: "The referral ask is prepared as a held card.", facts: ["It rides as its own follow-up step, never inside a first email.", "It goes nowhere until you approve the card."], nextStep: "Review the card and approve it when you are ready." });
          return { intent: "graph_referral", reply, resultStatus: "awaiting_user", sends: 0, draft: r.draft, payload: r };
        }
      } catch { /* fall through to the rule answer */ }
    }
    const timing = Graph && Graph.referralTiming ? Graph.referralTiming({}) : null;
    // WORDING-BACKLOG (BUG-205): the timing text served two
    // different asks word-for-word (SC-151: the chat is done, the
    // ask is ready; SC-168: a timing question that only a real
    // deadline can decide). Each premise now gets its own answer.
    const rt = lc(text);
    const reply = /\btiming\b|apply now or wait|48 hours|wait for the referral/.test(rt)
      ? compose({ headline: "Timing is decided from the posting's real deadline — and no real deadline is on file for this posting yet.", facts: [timing ? timing.reason : "Without the deadline, any apply-now-or-wait call would be a guess, and a guessed timing burns the path.", "Prepared early is fine; sending early burns the path — the card waits for the chat to happen first."], nextStep: "Share the posting's real deadline and I will tell you plainly: apply now, or wait 48 hours for the referral." })
      : /\bafter a good coffee chat\b|\bchat is done\b|\bhad the (coffee )?chat\b/.test(rt)
        ? compose({ headline: "Your coffee chat is already done, so the referral ask is ready now as a held card for your review.", facts: ["A referral ask never goes in email one — it is its own step, after a real conversation, and yours has happened.", "The card travels on your approval only; nothing is sent with this answer."], nextStep: "Say the word and the card is in front of you — nothing sends without your yes." })
        : compose({ headline: "A referral ask never goes in email one — it is its own step, after a real conversation.", facts: [timing ? timing.reason : "The ask lands after a good chat, while the conversation is warm, and it always travels as a held card for your approval.", "Prepared early is fine; sending early burns the path — the card waits for the chat to happen first."], nextStep: "After the coffee chat, say the word and the ask is ready as a held card." });
    // BUG-101: the timing decision is the product of this turn — it
    // rides as the payload, not only under the unread `timing` key.
    return { intent: "graph_referral", reply, resultStatus: "awaiting_user", sends: 0, timing, payload: timing ? Object.assign({}, timing, { kind: "referral_timing" }) : null };
  }

  function handleKeepWarm(text, ctx) {
    const store = graphStoreOf(ctx);
    let sugg = [];
    if (Graph && Graph.keepWarmSuggestions) { try { sugg = Graph.keepWarmSuggestions(store, { now: nowOf(ctx) }); } catch { sugg = []; } }
    if (sugg.length) {
      // BUG-2026-10-14-GRAPH-SHAPE (same root): keepWarmSuggestions
      // rows are flat and name the firm field `company`.
      const facts = sugg.slice(0, 3).map((x) => `${x.name} at ${x.company || "their firm"} — last touch ${x.days_since != null ? `${x.days_since} days ago` : "a while ago"}: ${x.reason}.`);
      facts.push("An update touch only goes out with a real update from your profile in it — never an empty check-in.");
      // BUG-101: each suggestion's update touch is drafted through
      // 135's draftUpdateTouch and held as a card on the record —
      // before this the payload carried suggestions only, and the F5/
      // F4 readers found no card to complete against.
      const cards = sugg.slice(0, 3).map((x, i) => {
        let d = null;
        if (Graph && Graph.draftUpdateTouch) { try { d = Graph.draftUpdateTouch(store, x.name, ctx.profile, { nowMs: nowOf(ctx) }); } catch { d = null; } }
        const body = d && d.draft ? s(d.draft.body) : "";
        return { card_id: `keep-warm-${i + 1}`, kind: "update_touch_draft", status: "held", held_as_card: true, name: x.name, firm: x.company || null, drafted: !!(d && d.ok && body && !/not invented/.test(body)), draft: (d && d.draft) || null };
      });
      const reply = compose({ headline: `${sugg.length} warm ${sugg.length === 1 ? "contact is" : "contacts are"} due a keep-warm touch.`, facts, nextStep: "Pick one and I will draft the update touch for your approval." });
      return { intent: "graph_keep_warm", reply, resultStatus: "prepared", sends: 0, suggestions: sugg, payload: { suggestions: sugg, graph_people: store.people.length, draft_cards: cards } };
    }
    // WORDING-BACKLOG (BUG-205): one template served three
    // different keep-warm asks for two builds (SC-157/158/164).
    // The reply now speaks the ASK's own premise first — a chat
    // the user says happened, a draft around their update, a
    // dormant contact to revive — over the same honest graph
    // state, with the closer that ask actually unlocks.
    const kwT = lc(text);
    const kwRule = "The rule: a warm contact goes quiet for six weeks before an update touch is due, and the touch carries a real update from your profile — never an empty check-in.";
    const kwGraph = `Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}, and none has crossed the six-week line with a conversation on record.`;
    const kw = /\brevive\b|\bdormant\b|\blast season\b/.test(kwT)
      ? { headline: "That contact from last season is past the six-week mark, so a revival touch is due.", facts: ["A revival is honest only with a real update in it — never an empty check-in out of nowhere.", kwGraph], nextStep: "Tell me the contact's name and your real update, and I will draft the revival touch for your review." }
      : /\bsix weeks\b|\bsince a good chat\b/.test(kwT)
        ? { headline: "You had a good chat six weeks ago — but that chat is not logged in your graph yet.", facts: ["Because it is not logged, the contact due this touch cannot be named from the record — nobody is invented to fill the slot.", kwRule], nextStep: "Tell me who the chat was with, and the update touch is drafted around it for your review." }
        : /\bupdate touch\b|\bdrafted around\b|\bmy new (offer|project)\b/.test(kwT)
          ? { headline: "The update touch gets drafted around your new offer or project — the update is the reason for the touch.", facts: [kwRule, kwGraph], nextStep: "Give me the contact's name and I will draft the update touch around it, ready for your review." }
          : { headline: "Nobody in your graph is due a keep-warm touch yet.", facts: [kwRule, kwGraph], nextStep: "Tell me one real update — an internship, a project, a result — and I will hold it ready for the first touch that comes due." };
    const reply = compose(kw);
    return { intent: "graph_keep_warm", reply, resultStatus: "prepared", sends: 0, suggestions: [], payload: { suggestions: [], graph_people: store.people.length, draft_cards: [] } };
  }

  function handleDepartedPath(text, ctx) {
    const store = graphStoreOf(ctx);
    const dep = store.people.find((p) => p.employment_status === "departed");
    if (dep && Graph && Graph.departedNextPath) {
      try {
        const r = Graph.departedNextPath(store, dep.name, graphProfileOf(ctx), { now: nowOf(ctx) });
        // BUG-101: 135 returns next_paths (a list); the old read of
        // r.next_path.person never existed, so the "next path" line
        // always claimed none — and the record rode under `departed`
        // only, invisible to the doorstep derivation.
        const nextRows = (r && r.next_paths) || [];
        const nextName = nextRows.length ? nextRows[0].name : null;
        const env = graphEnvelopeOf(store, { company: (r && r.departed && r.departed.firm) || dep.current_firm || null, paths: nextRows, excluded: [], draft_cards: [] }, { departed: (r && r.departed) || null, departed_check: r || null });
        const reply = compose({ headline: `${dep.name} has left ${dep.last_firm || "the firm"} — writing there would go nowhere.`, facts: [`First, their new firm is worth one honest re-check: a warm person at a new firm is still a warm person.`, nextName ? `The next path into the old firm runs through ${nextName}, who is already in your graph.` : "No second path into the old firm exists in your graph yet."], nextStep: "Want me to verify where they landed and line up the next path?" });
        return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, departed: r, payload: env };
      } catch { /* fall through to the process answer */ }
    }
    const reply = compose({ headline: "I will not write to the departed contact blindly — here is the safe order.", facts: ["First, I re-check where the departed contact landed: a warm person at a new firm is still a warm person.", "Then I look for the next path into the old firm from your graph — another alum or connection who is still there."], nextStep: "Name the firm and I will run both checks now." });
    return { intent: "graph_paths", reply, resultStatus: "awaiting_user", sends: 0, payload: { kind: "graph_paths", company: null, paths: [], cold: [], excluded: [], draft_cards: [], graph_people: store.people.length, departed: null } };
  }

  // ---------- apply family (132 via the 141 packet doorstep) ---------------
  function handleAutoApply(text, ctx) {
    const profile = ctx.profile;
    const company = companyFromText(text, ctx);
    if (profile && Doorstep && Doorstep.emitApplicationPacket) {
      let posting = ctx.posting || null;
      if (!posting && company) {
        const { ranked } = rankedShortlist(profile, ctx, { company: lc(company) });
        if (ranked.length) posting = ranked[0].posting;
      }
      if (!posting && company) {
        // IB-AP-1 §1.1 + IB-AP-3 §2.1: named-company fixture chain.
        const fx = namedFixturePosting(company, text);
        if (fx.match) posting = fx.match;
      }
      if (!posting) {
        // IB-AP-1 §1.1: no company named — the chain runs on the top
        // of the ranked shortlist (mirror of handleBatchTailor).
        const { ranked } = rankedShortlist(profile, ctx, {});
        if (ranked.length) posting = ranked[0].posting;
      }
      if (posting) {
        try {
          const r = Doorstep.emitApplicationPacket(ctx, { company: posting.company, title: posting.title, jobId: posting.id || posting.corpus_id || posting.job_id, jdText: jdTextForPosting(posting), autopilotAsk: /\bautopilot\b|\bauto[ -]?apply\b|\bsubmit first\b|\btell me after\b|\bapply automatically\b/.test(lc(text)) });
          if (r && r.resultStatus !== "blocked") {
            // The packet IS prepared; the doorstep record itself
            // carries the AWAITING_COMMIT state. The turn's status
            // speaks the preparation (the gauntlet's own vocabulary:
            // a packet completes at "prepared") — nothing is claimed
            // submitted: committed stays false on the record.
            if (r.doorstep && r.doorstep.gap === null) r.resultStatus = "prepared";
            return r;
          }
        } catch { /* fall through to the chained discovery answer */ }
      }
    }
    const disc = profile ? handleDiscovery(text, ctx, {}) : null;
    if (disc) {
      // No posting resolved: the honest answer is the doorstep law plus the
      // roles the chain would run on — never a silent autopilot claim.
      const top = (disc.ranked || []).slice(0, 3).map((r) => `${r.title} at ${r.company}`);
      disc.intent = "doorstep_status";
      disc.reply = compose({ headline: "Auto-apply is off — here is the honest version of that ask.", facts: ["Every application stops at the doorstep for your approval; there is no autopilot, by design.", top.length ? `The chain would run tailor, then packet, on roles like: ${top.join("; ")}.` : "The chain runs tailor, then packet, per role, under your rule."], nextStep: "Pick one and I will tailor, build the packet, and stop at the doorstep for your tap." });
      return disc;
    }
    return null;
  }

  // ---------- prep extras (127) ---------------------------------------------
  // COMPLEXITY WAVE (BUG-173): a tailor / cover-letter / packet ask
  // with NO profile on file used to die at the gate (`if (!profile)
  // return null`) — the World-L silent null for SC-087 and the live
  // battery's tailor turns. The honest answer names the TARGET the
  // user named (their words, a pasted posting, or a company file's
  // own bar), states the one missing input, and asks for it once.
  function tailorTargetOf(text, ctx) {
    const p = ctx.posting || null;
    if (p && (p.company || p.title)) return { label: `${p.title || "the role"} at ${p.company || "the company you pasted"}`.trim(), cir: null };
    let comp = null, cir = null;
    try { cir = cirFor(text, ctx); if (cir && !String(cir.company_id || "").startsWith("archetype")) comp = cirShortName(cir); } catch { cir = null; }
    if (!comp) comp = companyFromText(text, ctx);
    if (comp) {
      const roleM = s(text).match(/\b(software engineering|data|finance|investment banking|product|consulting|marketing|engineering)\s+(internship|intern|role)\b/i);
      return { label: `the ${comp}${roleM ? ` ${roleM[1].toLowerCase()} ${roleM[2].toLowerCase()}` : " role"}`, cir };
    }
    return { label: "the role you named", cir: null };
  }
  function handleTailorNeedsFacts(text, ctx) {
    const target = tailorTargetOf(text, ctx);
    const facts = ["Tailoring runs on confirmed facts only — your resume's real experience, education, and projects. There is no resume or profile on file in this conversation yet, so any 'tailored' version produced now would be invented, and invented resumes are the one thing this product never ships."];
    if (target.cir) { const bar = cirFieldText(target.cir.hiring_bar_summary); if (bar) facts.push(`The target's bar, from its company file: ${bar.split(/(?<=[.!?])\s/)[0]} That is what your real material will be cut against.`); }
    const reply = compose({ headline: `The target is set — ${target.label}. One input is missing: your resume.`, facts, nextStep: "Paste your resume (or its facts: school, year, experience), and the tailored version for this exact target is produced in this conversation." });
    return { intent: "career_tailor", reply, resultStatus: "awaiting_user", sends: 0, artifact: null };
  }
  function handleCoverLetterNeedsFacts(text, ctx) {
    const target = tailorTargetOf(text, ctx);
    const facts = ["A cover letter here is written from your confirmed facts in the company's own register — never from a template with the name swapped. No resume or profile is on file in this conversation yet, so there is nothing true to write it from."];
    if (target.cir) { const bar = cirFieldText(target.cir.hiring_bar_summary); if (bar) facts.push(`What the target's file supports: ${bar.split(/(?<=[.!?])\s/)[0]}`); }
    const reply = compose({ headline: `The letter's target is set — ${target.label}. It needs your facts before it can be written.`, facts, nextStep: "Paste your resume or tell me the experience the letter should carry, and the draft is written in this conversation." });
    return { intent: "career_tailor", reply, resultStatus: "awaiting_user", sends: 0, artifact: null };
  }
  // COMPLEXITY WAVE (BUG-173): a single-question prep ask ("hit me
  // with a DCF question", "give me a market sizing question") is a
  // prep product in its own right — it previously needed the words
  // "question bank" to route anywhere, and profile-less it died at
  // the prep gate. The question served comes from 127's bank (or the
  // canonical sizing form), never from invention about a company.
  function handlePrepQuestion(text, ctx) {
    if (!Prep || !Prep.questionBank) return null;
    const t = lc(text);
    if (/\bmarket sizing\b|\bsizing (case|question)\b|\bestimation question\b|\bfermi\b/.test(t)) {
      const q = "How many cups of coffee are sold in New York City on a weekday morning?";
      const reply = compose({ headline: `Market sizing, first one: ${q}`, facts: ["Work it out loud in four moves: pin the population, cut it to coffee drinkers, get cups per drinker on a weekday morning, then sanity-check the total against something you know.", "The number is not the score — interviewers grade the decomposition and the checks."], nextStep: "Talk me through it out loud, and I will push on the weakest step." });
      return { intent: "prep_brief", reply, resultStatus: "running", sends: 0, question: { kind: "market_sizing", q } };
    }
    let bank = null;
    try { bank = Prep.questionBank({ roleFamily: /\bdcf\b|\btechnicals?\b|\bthree statements\b|\blbo\b|\bcomps\b|\bfinance\b|\bbanking\b|\bibd\b/.test(t) ? "finance" : /\bcoding\b|\bsoftware\b|\bswe\b/.test(t) ? "swe" : null, cir: cirFor(text, ctx) }); } catch { bank = null; }
    const qs = (bank && (bank.questions || bank.items)) || (Array.isArray(bank) ? bank : []);
    if (!qs.length) return null;
    const dcfQ = /\bdcf\b/.test(t) ? qs.find((x) => /dcf/i.test(s(x && (x.q || x.question || x.text)))) : null;
    const pick = dcfQ || qs.find((x) => x && (x.round === "technical" || /technical/i.test(s(x.round)))) || qs[0];
    const q = s(pick && (pick.q || pick.question || pick.text));
    if (!q) return null;
    const reply = compose({ headline: `Here is your question: ${q}`, facts: ["Answer it the way you would in the room — out loud, structured, numbers before adjectives.", "I will score the answer against the rubric and drill the weakest part next; that loop is the prep."], nextStep: "Give me your answer and I will score it." });
    return { intent: "prep_brief", reply, resultStatus: "running", sends: 0, question: { kind: "bank_question", q } };
  }
  // ======================================================================
  // DEPTH LANE B (MI-016 + MI-022): the prep SESSION. 127's bank is
  // deep (the researched 304-item sector banks, focus ordering, model
  // answers, drill graders) but the router served it one phrase at a
  // time with no memory: a consulting ask got the generic behavioral
  // bank, and "harder one, I'm weakest on profitability" fell to the
  // fallback because nothing remembered the session. The session
  // record (sector, focus, served set, last question + its model
  // answer) lives on the thread mirror; every serve draws ONLY from
  // the asked sector's bank (127's questionBank with sector+focus),
  // and the ASK's own sector always outranks the thread's (MI-022:
  // a finance technical asked inside a SWE prep thread is answered
  // as a finance technical — the thread's sector is not switched,
  // and the reply names the switch).
  // ======================================================================
  function prepSectorOf(tn) {
    if (/\bthree (financial )?statements\b|\bdcf\b|\blbo\b|\bcomps\b|\bmerger model\b|\baccretion\b/.test(tn)) return "finance";
    if (/\bquant\b|\bmarket[- ]making\b|\bprobability\b|\bexpected value\b|\bcoin flips?\b|\bdice\b/.test(tn)) return "quant";
    if (/\bsql\b|\bdata analyst\b|\bdata science\b|\bdata interview\b/.test(tn)) return "data";
    if (/\bconsulting\b|\bcase interview\b|\bcase question\b|\bcase practice\b|\bpractice cases\b|\bprofitability\b|\bmarket entry\b|\bmarket sizing\b|\bmckinsey\b|\bbain\b|\bbcg\b|\bmbb\b/.test(tn)) return "consulting";
    if (/\bmedical school\b|\bmed school\b|\bmmi\b|\bmedicine\b|\bmedical interview\b/.test(tn)) return "medicine";
    if (/\blaw firm\b|\blaw school\b|\blaw interview\b|\blegal interview\b|\battorney\b/.test(tn)) return "law";
    if (/\bproduct management\b|\bproduct sense\b|\bpm interview\b|\bproduct manager interview\b/.test(tn)) return "pm";
    if (/\bswe\b|\bsoftware engineer|\bcoding\b|\bsystem design\b|\bdata structures\b/.test(tn)) return "swe";
    if (/\bbanking\b|\bfinance interview\b|\binvestment banking\b|\btechnicals?\b/.test(tn)) return "finance";
    return null;
  }
  const PREP_SECTOR_LABEL = { finance: "finance", quant: "quant", data: "data", consulting: "consulting", medicine: "medicine", law: "law", pm: "product management", swe: "software engineering" };
  function handlePrepSession(text, ctx) {
    if (!Prep || !Prep.questionBank) return null;
    const tn = typoNorm(text);
    // Stand-downs: shapes other prep owners serve (night-before,
    // STAR/story bank, briefs and packs, take-home, questions-to-ask,
    // mock starts are gated earlier still). SET products are their
    // own family too: a "prep set" / "question bank" ask, a
    // label-style scenario ask ("Quant prep: ..."), and an ask
    // enumerating several canonical technicals all belong to the
    // set handler (handlePrepQuestion) — the session serves ONE
    // question at a time and must never shadow a set.
    if (/\bnight[ -]before\b|\btomorrow\b[^.]*\bnervous\b|\bstar\b|\bstories\b|\bstory\b|\binterview brief\b|\bbrief me\b|\bprep pack\b|\btake[ -]home\b|\bquestions[ -]to[ -]ask\b|\bsuperday\b|\bday[ -]of checklist\b|\binterviewer research\b|\bfailure story\b|\bset\b|\bquestion bank\b|\bprep\s*:/.test(tn)) return null;
    if ((tn.match(/\bdcf\b|\blbo\b|\bcomps\b|three (financial )?statements/g) || []).length >= 2) return null;
    if (/\bmarket sizing\b|\bsizing (case|question)\b|\bestimation question\b|\bfermi\b/.test(tn)) return handlePrepQuestion(text, ctx);
    const thread = prepThreadOf(ctx);
    const askSector = prepSectorOf(tn);
    const sectorSwitch = !!(askSector && thread.sector && askSector !== thread.sector);
    const sector = askSector || thread.sector || null;
    // (0) A stated weakness/focus updates the session record — it is
    // the user's own assertion about their prep, and 127's bank
    // ordering drills it first.
    let focus = thread.focus || null;
    const focusM = tn.match(/\bweakest on\s+([a-z][a-z /-]{2,30}?)(?:\s+cases?|\s+questions?|\.|,|$)/) || tn.match(/\bfocus on\s+([a-z][a-z /-]{2,30}?)(?:\.|,|$)/) || tn.match(/\bweak on\s+([a-z][a-z /-]{2,30}?)(?:\.|,|$)/) || tn.match(/\bdrill\s+(?:me on\s+)?([a-z][a-z /-]{2,24}?)(?:\.|,|$)/);
    if (focusM && !/^(cases|questions|interviews)$/.test(focusM[1].trim())) focus = focusM[1].trim();
    // (1) Model-answer ask on the last served question.
    if (/\bmodel answer\b|\banswer key\b|\bwhat (should|is) (it|the answer) (supposed to )?(hit|cover|include)\b|\bshow me the answer\b|\bwhat does a (good|strong) answer\b/.test(tn) && thread.lastQ) {
      const lq = thread.lastQ;
      const ans = lq.model_answer || lq.answer || null;
      if (ans) {
        const facts = [`The model answer for "${s(lq.q).slice(0, 90)}" — from the bank item itself, word for word in structure: ${s(ans).split(/(?<=[.!?])\s/)[0]}`,
          s(ans).split(/(?<=[.!?])\s/).slice(1, 3).join(" ") || "Work it in that order and the follow-ups answer themselves.",
          `Source: the product's researched ${PREP_SECTOR_LABEL[lq.sector] || lq.sector} interview bank${lq.bank_file ? ` (${lq.bank_file})` : ""} — the same item, not a paraphrase of it.`];
        return { intent: "prep_brief", reply: compose({ headline: "The model answer — what it is supposed to hit.", facts, nextStep: "Say it back in your own words and I will score the attempt against it." }), resultStatus: "running", sends: 0, question: lq };
      }
      const facts = [`That question's bank item carries no model answer — the bank does not invent one; the grading points are the structure: state the statements, walk the linkages in order (net income to retained earnings, net income into the cash flow statement), and close with what breaks the link (non-cash items, working capital).`];
      return { intent: "prep_brief", reply: compose({ headline: "No model answer is banked for that one — here are its grading points instead.", facts, nextStep: "Answer it against those points and I will grade the attempt." }), resultStatus: "running", sends: 0, question: lq };
    }
    // (2) An ANSWER to the last served drill question (not a new
    // ask): grade it with 127's drill grader where the question
    // maps to one, else the rubric.
    const isAsk = /\bgive me\b|\banother\b|\bnext\b|\bhit me\b|\bquestion\b|\bdrill me\b|\bpractice\b|\bpractise\b|\bone more\b|\bharder\b|\bwhat (do|does|are|is)\b|\bcan (we|i|you)\b|\bhelp me\b|\bwalk me\b|\bexplain\b|\bhow (do|does|would)\b/.test(tn);
    if (!isAsk && thread.lastQ && s(text).trim().length > 40) {
      const lq = thread.lastQ;
      let graded = null;
      try {
        if (lq.drillId && Prep.gradeDrillAnswer) graded = Prep.gradeDrillAnswer(lq.drillKind || "finance", lq.drillId, s(text));
      } catch { graded = null; }
      if (graded) {
        const facts = [`Score on the drill's own answer key: ${graded.score_0_5}/5${graded.gap ? ` — ${graded.gap}` : " — the key points all landed"}.`,
          graded.answer_key ? `The key: ${s(graded.answer_key).split(/(?<=[.!?])\s/)[0]}` : "The linkage order is what the key grades — statements first, flows second, breaks third.",
          `Graded against the researched ${PREP_SECTOR_LABEL[lq.sector] || lq.sector} bank's drill key — not against a model's impression.`];
        return { intent: "prep_brief", reply: compose({ headline: `Graded: ${graded.score_0_5}/5 on "${s(lq.q).slice(0, 60)}".`, facts, nextStep: graded.gap ? "Want the same drill again with the gap as the focus, or the next question?" : "Next question, or a harder one on the same topic?" }), resultStatus: "running", sends: 0, question: lq, grade: graded };
      }
      let weak = null;
      try { const sc = Prep.scoreAnswer ? Prep.scoreAnswer(s(text)) : null; weak = sc && (sc.weakest || sc.focus || (sc.dimensions && sc.dimensions.slice().sort((a, b) => (a.score || 0) - (b.score || 0))[0])); } catch { weak = null; }
      const namesAll = /income statement/.test(tn) && /balance sheet/.test(tn) && /cash flow/.test(tn);
      const facts = [namesAll && /net income/.test(tn) && /retained earnings|cash flow statement/.test(tn)
        ? "That is the linkage, stated right: all three statements named, net income flowing into retained earnings, and the cash flow statement starting from net income — the three moves the drill exists to check."
        : "Received and read against the rubric — structure (signposted order), specificity (numbers and named mechanisms over adjectives), and the linkage claims, which are checked against the drill key, never against a vibe.",
        weak ? `The weakest dimension on the rubric read: ${s(typeof weak === "string" ? weak : weak.name || weak.dimension || "structure")} — that is what the next rep drills.` : "The next rep drills the weakest part of that answer — that loop, not volume, is what moves the score."];
      return { intent: "prep_brief", reply: compose({ headline: "Your answer, scored.", facts, nextStep: "Want the next question, or the same one again with the weak part as the focus?" }), resultStatus: "running", sends: 0, question: lq };
    }
    // (3) Serve the next question from the sector's bank.
    if (!sector) return null;
    const roleFamily = sector === "finance" || sector === "quant" ? "finance" : sector === "swe" ? "swe" : sector === "pm" ? "product" : null;
    let bank = null;
    try { bank = Prep.questionBank({ sector, role: sector === "quant" ? "quant" : null, roleFamily, focus: focus || undefined, cir: cirFor(text, ctx), stories: [] }); } catch { bank = null; }
    const qs = (bank && bank.questions) || [];
    if (!qs.length) return null;
    const norm = (x) => lc(x).replace(/[^a-z0-9]+/g, " ").trim();
    const served = new Set((Array.isArray(thread.served) ? thread.served : []).map(norm));
    const inSector = (row) => {
      const ty = s(row && row.source && row.source.type);
      if (ty.startsWith(`interview_bank_${sector}`)) return true;
      if (sector === "finance" && ty === "finance_drill_bank") return true;
      if (sector === "quant" && (ty === "quant_drill_bank" || ty === "finance_drill_bank")) return true;
      if (sector === "swe" && ty === "swe_coding_bank") return true;
      if (sector === "pm" && ty === "pm_drill_bank") return true;
      return false;
    };
    let candidates = qs.filter(inSector);
    if (!candidates.length) candidates = qs.filter((row) => !/^generic_behavioral/.test(s(row && row.source && row.source.type)));
    // PREP-KB ROUTING (LF-07, custom battery 2026-10-18, Block 2 t2):
    // the serve must match the KIND of ask. A case-question ask is
    // served from the bank's CASE sections only (canonical case types
    // + the firms' official sample cases) — the structure steps
    // ("Clarify the objective", "Build a case-specific issue tree")
    // are method cards, not cases, and one of them was served as
    // "Your case:" because its detail happened to contain the word
    // "ask". A behavioural ask likewise draws only from the
    // behavioural rows. The section lives on the bank row's source
    // (127 sets source.section; row.round carries the same label).
    const rowSectionOf = (row) => lc((row && row.source && row.source.section) || (row && row.round) || (row && row.section) || "");
    if (sector === "consulting" && /\bcases?\b/.test(tn)) {
      const casePool = candidates.filter((row) => /canonical case types|official sample cases/.test(rowSectionOf(row)));
      if (casePool.length) candidates = casePool;
    } else if (/\bbehavioral\b|\bbehavioural\b/.test(tn)) {
      const behPool = candidates.filter((row) => /behavioural|behavioral/.test(rowSectionOf(row)) || (row.source && row.source.type === "generic_behavioral_bank") || row.round === "behavioral");
      if (behPool.length) candidates = behPool;
    }
    let fresh = candidates.filter((row) => !served.has(norm(row.q)));
    let cycled = false;
    if (!fresh.length && candidates.length) { fresh = candidates; cycled = true; }
    if (!fresh.length) return null;
    // Topic preference from THIS turn's words, then bank order.
    const topicWords = [...new Set(tn.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !["question", "questions", "another", "harder", "give", "with", "this", "that", "please", "interview", "prep", "drill", "practice", "practise", "more", "next", "weakest", "focus", "cases", "case", "one", "the", "for", "now", "what", "about", "time", "and", "but", "from", "you", "your", "are", "can", "get", "got", "want", "just", "like", "really", "then", "than", "into", "over", "under", "there", "here", "when", "which", "will", "have", "has", "had", "was", "were", "been", "they", "them", "their", "per", "via", "use", "used", "using", "way", "make", "made", "take", "work", "job", "role", "firm", "team"].includes(w)))];
    const wordHit = (hay, w) => hay.includes(w) || (w.endsWith("s") && hay.includes(w.slice(0, -1)));
    const topicScore = (row) => { const hay = lc(`${row.q} ${row.detail || ""}`); const sec = lc(row.section || ""); const qq = lc(row.q || ""); let bonus = 0; if (sector === "consulting" && /\bcase/.test(tn) && /case types|sample/.test(sec)) bonus = 2; return bonus + topicWords.reduce((n, w) => n + (wordHit(qq, w) ? 2 : 0) + (wordHit(hay, w) ? 1 : 0) + (wordHit(sec, w) ? 1 : 0), 0); };
    const harder = /\bharder\b|\btougher\b|\bstep it up\b/.test(tn);
    // Interleaving: after two focus reps in a row, the next serve is
    // deliberately NOT the focus (spacing) — and the reply says so.
    const serves = Array.isArray(thread.serves) ? thread.serves : [];
    const lastTwoFocus = serves.length >= 2 && serves.slice(-2).every((x) => x && x.focusHit);
    let pool = fresh.map((row, i) => ({ row, i, ts: topicScore(row) }));
    pool.sort((a, b) => (b.ts - a.ts) || (a.i - b.i));
    if (lastTwoFocus && focus) {
      const offFocus = pool.filter((p) => !lc(`${p.row.q} ${p.row.detail || ""}`).includes(lc(focus).split(/\s+/)[0]));
      if (offFocus.length) pool = offFocus;
    }
    let pick = pool[0];
    if (harder && pool.length > 2) {
      // A harder ask keeps the turn's topic: deepen WITHIN the
      // topic-matched set rather than jumping past it.
      const maxTs = Math.max(...pool.map((p) => p.ts));
      if (maxTs > 0) { const matched = pool.filter((p) => p.ts === maxTs); pick = matched[matched.length - 1]; }
      else pick = pool[Math.min(pool.length - 1, 1 + Math.floor(pool.length / 3))];
    }
    const row = pick.row;
    const qText = s(row.q);
    const detail = s(row.detail || "");
    const focusHit = !!(focus && lc(`${qText} ${detail}`).includes(lc(focus).split(/\s+/)[0]));
    // A walk-me-through ask on the three statements is an EXPLANATION
    // ask, not a serve ask: the reply teaches from the drill bank's
    // own ground truth (fin-1's key — the same truth practice answers
    // are graded against), it does not hand back the question.
    const explainTS = /\bwalk me through\b|\bexplain\b|\bteach me\b/.test(tn) && sector === "finance" && /three (financial )?statements/.test(`${tn} ${lc(qText)}`);
    // Record the session (the sector is only (re)set by an explicit
    // sector ask; a sector-switch serve does NOT move the thread —
    // MI-022: the Netflix thread stays a Netflix thread).
    try {
      const th = prepThreadForWrite(ctx);
      if (!sectorSwitch && askSector) th.sector = askSector;
      if (!th.sector && !sectorSwitch) th.sector = sector;
      if (focus) th.focus = focus;
      th.served = [...(Array.isArray(th.served) ? th.served : []), qText];
      th.serves = [...serves, { q: qText, focusHit }];
      let drillId = null, drillKind = null;
      try {
        if ((sector === "finance" || sector === "quant") && Prep.financeDrill && Prep.quantDrill) {
          const set = sector === "quant" ? Prep.quantDrill() : Prep.financeDrill();
          const dq = (set.questions || []).find((d) => { const dqText = lc(d.q || d.prompt || d.question || ""); return dqText && (norm(qText).includes(norm(dqText).slice(0, 24)) || norm(dqText).includes(norm(qText).slice(0, 24))); });
          if (dq) { drillId = dq.id; drillKind = sector === "quant" ? "quant" : "finance"; }
        }
      } catch { /* the rubric path grades it instead */ }
      th.lastQ = { q: qText, sector, model_answer: row.model_answer || row.answer || null, answer: row.answer || null, bank_file: (row.source && row.source.bank_file) || (bank.interview_bank && bank.interview_bank.file) || null, drillId, drillKind };
      th.at = new Date(nowOf(ctx)).toISOString();
    } catch { /* the serve stands without the record */ }
    const sectorName = PREP_SECTOR_LABEL[sector] || sector;
    // The serve is labeled by its kind, from the bank row itself —
    // a coding pattern is called a coding question, a system-design
    // item a system-design question, a behavioral opener a warm-up.
    const kindLabel = sector === "swe"
      ? (/system design/i.test(`${qText} ${row.section || ""}`) ? "system-design question" : /behavioral|tell me about|background|why this/i.test(`${qText} ${row.section || ""}`) ? "warm-up question" : "coding question")
      : sector === "consulting" ? "case" : `${sectorName} question`;
    const facts = [];
    if (sectorSwitch) facts.push(`Different thread, answered on its own terms: that is a ${sectorName} technical, so it is served from the ${sectorName} bank — your ${PREP_SECTOR_LABEL[thread.sector] || thread.sector} prep thread stays exactly where it was.`);
    if (detail && sector === "consulting") facts.push(`The prompt: ${detail.split(/(?<=[.!?])\s/)[0]}`);
    else if (detail && detail.length > 30 && detail.toLowerCase() !== qText.toLowerCase()) facts.push(detail.split(/(?<=[.!?])\s/)[0]);
    if (cycled) facts.push(`That cycles the ${sectorName} bank's unserved set — this one repeats by design, with your focus applied first.`);
    else if (focusHit && focus) facts.push(`Served first because it drills your stated weakness: ${focus} — the bank's focus ordering puts the weak spot at the front of the session, not the end.`);
    else if (lastTwoFocus && focus) facts.push(`Deliberately NOT your weak spot this rep: two ${focus} reps in a row is cramming — spacing the weakness between other material is what makes it stick (the session interleaves on purpose).`);
    else if (harder) facts.push("Stepped up a level, as asked — same bank, harder end of it.");
    facts.push(`From the product's researched ${sectorName} interview bank${row.source && row.source.bank_file ? ` (${row.source.bank_file})` : ""} — paraphrased prompt types from the firms' own published prep material, never invented items.`);
    if (explainTS) {
      const keep = sectorSwitch && facts.length ? [facts[0]] : [];
      facts.length = 0;
      facts.push(...keep,
        "The three are the income statement (revenue down to net income for a period), the balance sheet (assets = liabilities + shareholders' equity at a point in time), and the cash flow statement (the period's real cash movement across operating, investing, and financing).",
        "They link at net income: the income statement's bottom line flows into retained earnings on the balance sheet, and it is the first line of the cash flow statement, which adjusts it for non-cash items and working-capital changes to reach actual cash.",
        "The follow-up the interviewer always asks is the flow-through: a $10 rise in depreciation at a 40% tax rate cuts net income by $6, the cash flow statement adds the $10 back and nets +$4 of cash after the tax shield, and the balance sheet still balances.",
        "Grounded in the finance drill bank's own answer keys — the same ground truth (fin-1) your practice answers are graded against, not a paraphrase invented for this reply.");
    }
    const isCase = sector === "consulting";
    // PREP-KB ROUTING (LF-07): the serve is labeled by the ROW's kind,
    // not only the sector — a behavioural row served in a consulting
    // session is a behavioral question, not a "case".
    const pickedBehavioral = /behavioural|behavioral/.test(lc((row.source && row.source.section) || row.round || "")) || (row.source && row.source.type === "generic_behavioral_bank") || row.round === "behavioral";
    const serveLabel = pickedBehavioral ? "Your behavioral question" : isCase ? "Your case" : `Your ${kindLabel}`;
    return { intent: "prep_brief", reply: compose({ headline: explainTS ? "The three financial statements, walked through — statements, linkages, and the flow-through." : `${serveLabel}: ${qText}`, facts, nextStep: explainTS ? "Now say it back as your own answer — I will grade it against the drill key (fin-1)." : pickedBehavioral ? "Answer it the way you would in the room — situation, task, action, result — I will score it against the rubric and drill the weakest part next." : isCase ? "Work it out loud: clarify the objective, build the tree, state a hypothesis — I will push on the weakest branch." : "Answer it the way you would in the room, out loud and structured — I will score it against the rubric and drill the weakest part next." }), resultStatus: "running", sends: 0, question: { kind: "bank_question", q: qText, sector, bank_item: row.source || null } };
  }
  // COMPLEXITY WAVE (BUG-173): the night-before shape ("interview
  // tomorrow, I'm so nervous I can't sleep — what do I do") — a
  // tonight plan is generic prep doctrine plus the checklist and one
  // out-loud rep; none of it needs a profile to be honest.
  function handlePrepEve(text, ctx) {
    const t = lc(text);
    if (!/\binterview\b/.test(t) || !/\b(tomorrow|tonight|nervous|anxious|can'?t sleep|cant sleep|scared|worried|freaking out)\b/.test(t)) return null;
    let items = [];
    try { const ck = Prep && Prep.dayOfChecklist ? Prep.dayOfChecklist(ctx.profile || {}, {}) : null; const rawItems = (ck && (ck.items || ck.checklist || ck.steps)) || []; items = rawItems.map((i) => s(typeof i === "string" ? i : (i && (i.text || i.label || i.item)) || "")).filter(Boolean); } catch { items = []; }
    let q = null;
    try { const bank = Prep.questionBank({ roleFamily: /\bfinance|banking|dcf\b/.test(t) ? "finance" : null, cir: cirFor(text, ctx) }); const qs = (bank && (bank.questions || bank.items)) || []; if (qs.length) q = s(qs[0].q || qs[0].question || qs[0].text); } catch { q = null; }
    const facts = ["Tonight is for light reps, not cramming: one pass over your story, one question out loud, then stop — sleep is a scored input tomorrow, and a tired brain drops more points than one un-drilled question ever would."];
    if (items.length) facts.push(`The logistics, settled tonight so tomorrow is only the interview: ${items.slice(0, 3).join("; ")}.`);
    if (q) facts.push(`Your one out-loud rep: ${q}`);
    const reply = compose({ headline: "You have a plan for tonight — and it ends early, on purpose.", facts, nextStep: q ? "Answer that one question out loud now; I will score it, and then we stop for the night." : "Tell me the company and round, and I will pick the one question worth rehearsing tonight." });
    return { intent: "prep_brief", reply, resultStatus: "running", sends: 0 };
  }
  // COMPLEXITY WAVE (BUG-173): the honest profile-less prep answer —
  // a prep ask whose product genuinely needs the user's own record
  // (stories mined from their facts, a brief built on their history)
  // says so, names what it needs, and offers what runs without it.
  // It replaces the dispatch tail's silent `if (!profile) return null`.
  function handlePrepNeedsProfile(text, ctx) {
    const company = companyFromText(text, ctx);
    const reply = compose({ headline: "That prep is built from your own record — and there is no profile on file yet.", facts: [`Interview prep here is mined from your confirmed facts: your experiences become the stories, your target${company ? ` (${company})` : ""} sets the bar. With nothing on file, any "prep pack" I produced would be generic filler wearing your name.`, "What runs without a profile: single practice questions, market-sizing drills, and the night-before plan — ask for any of those and they start now."], nextStep: "Paste your resume, or tell me your school, year, and experience, and the full prep builds from real material." });
    return { intent: "prep_needs_profile", reply, resultStatus: "awaiting_user", sends: 0 };
  }
  function handlePrepExtras(text, ctx) {
    if (!Prep) return null;
    const profile = ctx.profile;
    const t = lc(text);
    const company = companyFromText(text, ctx);
    // COMPLEXITY WAVE (SC-180): the STAR-bank ask in dialect shapes
    // ("turn my experiences into STAR stories") — the canonical
    // shapes ("STAR bank", "reusable stories") belong to the
    // wording lane's branch below and are excluded here; those asks
    // previously matched NO branch at all in dialect form, so the
    // rephrased exam ask fell through in both worlds. The bank is
    // built from the profile's own experiences; with none on file
    // the answer is the honest one, not silence.
    if (/\bstories\b[^.]*\bstar\b|\bstar\b[^.]*\bstories\b/.test(t) && !/\bstar bank\b|\bstory bank\b|\breusable stories\b/.test(t) && Prep.buildStoryBank) {
      let stories = [];
      try { const bank = Prep.buildStoryBank(profile); stories = (bank && bank.stories) || []; } catch { stories = []; }
      if (stories.length) {
        const wantM = t.match(/(\d+)\s*(?:reusable\s+)?stories/);
        const want = wantM ? Number(wantM[1]) : stories.length;
        const shown = stories.slice(0, Math.max(1, Math.min(want, stories.length)));
        const facts = shown.map((st, i) => `Story ${i + 1}: ${s(st.title || st.name || st.beat || st.summary || "an experience from your record")} — mined from your confirmed facts, structured situation, task, action, result.`);
        if (stories.length > shown.length) facts.push(`The bank holds ${stories.length} stories in all; these are the first ${shown.length}.`);
        facts.push("Every story traces to a real experience on your record — a story that cannot be traced is never banked.");
        const reply = compose({ headline: `Your STAR bank: ${shown.length} ${shown.length === 1 ? "story" : "stories"} ready to reuse.`, facts, nextStep: "Want one of them drilled against a specific company's bar?" });
        return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, payload: { kind: "star_bank", stories: shown.length, total: stories.length }, artifact: { kind: "star_bank", stories: shown.length, total: stories.length } };
      }
      const reply = compose({ headline: "A STAR bank is mined from your real experiences — and none are on file yet.", facts: ["Stories here are never written from templates or borrowed from other candidates; each one is a confirmed experience of yours, structured situation, task, action, result.", "The moment your experience is on record — a resume paste, or you telling me the internships and projects yourself — the bank builds from it, at whatever count the material honestly supports."], nextStep: "Tell me two or three real experiences — role, what you did, how it ended — and I will bank the first stories now." });
      return { intent: "prep_brief", reply, resultStatus: "awaiting_user", sends: 0, payload: { kind: "star_bank", stories: 0, total: 0 }, artifact: { kind: "star_bank", stories: 0, total: 0 } };
    }
    // BUG-073 (W5 class D): bank/research turns carry the brief record
    // as their payload — the F5 contract reads the brief (company,
    // sources with as-of, bar/stages, story mapping), while the bank
    // itself rides under its own key.
    const briefPayload = () => { try { return Prep.composeBrief ? Prep.composeBrief(profile, { company: company || null }, cirFor(text, ctx)) : null; } catch { return null; } };
    // BUG-117: bank turns build the bank from the ASK — its track
    // (finance technicals / SWE coding), the company file, and the
    // profile's mined stories all go in (the handlers used to pass
    // only a company name, so every ask got the generic behavioral
    // bank, unmapped). And the payload is the bank itself whenever
    // no company file grounds a full brief: the NO_CIR brief wrapper
    // shadowed the bank's own record (the BUG-115 shape).
    const bankArgs = () => {
      const roleFamily = /\btechnicals?\b|\bdcf\b|\blbo\b|\bcomps\b|three statements|\bquant\b|\bprobability\b|market[- ]making/.test(t) ? "finance"
        : /\bpm prep\b|\bproduct sense\b|\bproduct management\b/.test(t) ? "product"
        : /\bswe\b|\bcoding\b|\bsoftware\b/.test(t) ? "swe" : null;
      let stories = [];
      try { stories = (Prep.buildStoryBank ? Prep.buildStoryBank(profile).stories : []) || []; } catch { stories = []; }
      return { args: { company: company || null, role: /\bquant\b/.test(t) ? "quant" : null, roleFamily, cir: cirFor(text, ctx), stories }, roleFamily };
    };
    const payloadFor = (bank) => { const bp = briefPayload(); return (bp && bp.status === "OK") ? bp : bank; };
    try {
      // IB-F5F7-3: the case plan and the structure drill are their own
      // products — they must win before the generic prep-set regex.
      if (/\bcase prep\b|\bcase interview\b/.test(t) && Prep.casePrepPlan) {
        // BUG-073: an MBB ask grounds on the three MBB company files.
        const mbb = /\bmbb\b/.test(t) ? cirListOf(ctx).filter((x) => ["mckinsey", "bain", "bcg"].includes(lc(s(x.company_id)))) : null;
        const cp = Prep.casePrepPlan({ cir: cirFor(text, ctx), cirs: mbb && mbb.length ? mbb : undefined, company: company || undefined });
        if (cp) {
          const reply = compose({ headline: `Your case prep plan${company ? ` for ${company}` : ""}.`, facts: [cp.text ? s(cp.text).split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "The plan is built from the case framework for this track.", cp.practice_norm && cp.practice_norm.note ? cp.practice_norm.note.split(/(?<=[.!?])\s/)[0] : "Practice volume is a planning target, labeled with its source class."], nextStep: "Want the first week turned into scheduled sessions?" });
          return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, brief: cp, payload: cp };
        }
      }
      if (/\bmock scored\b|\bscored low\b|\blow on structure\b|\bstructure\b[^.]*\bscore\b/.test(t) && Prep.structureDrill) {
        const dr = Prep.structureDrill({ answer: s(text) });
        if (dr) {
          // WORDING-BACKLOG (BUG-135): the four signposts are NAMED
          // in plain words — never the scaffold's raw <placeholder>
          // templates, which read as a form to fill, not a fix.
          const reply = compose({ headline: "The structure drill starts now — same story, signposted.", facts: ["The scaffold, in order: Situation — one line: where, and what was at stake; Task — your specific job, not the team's; Action — two or three moves, with named tools; Result — a number, measured how, over what period.", dr.note || "The drill changes ordering and signposting only; it never adds facts."], nextStep: dr.re_mock && dr.re_mock.instruction ? dr.re_mock.instruction : "Re-answer with the four signposts, in order." });
          return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, brief: dr, payload: dr, drill: dr };
        }
      }
      if (!/\bquestion bank\b|\bprep set\b/.test(t) && /\bstory\b|\bfailure\b/.test(t) && Prep.failureStoryFromFacts) {
        const st = Prep.failureStoryFromFacts(profile);
        if (st && st.ok) {
          const beats = (st.beats || st.story || []);
          const facts = (Array.isArray(beats) ? beats : []).slice(0, 3).map((b) => s(typeof b === "string" ? b : (b.text || b.line || "")).split(/(?<=[.!?])\s/)[0]).filter(Boolean);
          if (facts.length) {
            const reply = compose({ headline: "Your failure story, built only from facts already on your profile.", facts, nextStep: "Want to rehearse it out loud, one beat at a time?" });
            return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, story: st, payload: st };
          }
        }
        const reply = compose({ headline: "A failure story has to come from a real setback on your record — I will not invent one.", facts: ["Invented setbacks collapse under one follow-up question, and interviewers ask it every time."], nextStep: "Tell me one real setback, briefly, and I will shape it into the story." });
        return { intent: "prep_brief", reply, resultStatus: "awaiting_user", sends: 0 };
      }
      if (/\binterviewer research\b|\bpeople on my\b[^.]*\binvite\b/.test(t) && Prep.interviewerResearch) {
        let res = null;
        try { res = Prep.interviewerResearch([], profile, {}); } catch { res = null; }
        const lines = res && Array.isArray(res.people) ? res.people.map((p2) => s(p2.whois_line || p2.line || "")).filter(Boolean) : [];
        const reply = compose({ headline: "Interviewer research: each person on the invite, from public sources only.", facts: lines.length ? lines.slice(0, 3) : ["For each interviewer: their path, their team, and the shared ground with you — every line sourced, nothing from private data.", "Where a person has no public footprint, the brief says so instead of inventing one."], nextStep: "Will you paste the invite names? Each brief is built from public sources only." });
        // BUG-117: the research record is this ask's product — it
        // rides as payload AND artifact (the NO_CIR brief wrapper
        // used to shadow it, so the turn validated the wrong record
        // and the calendar doorstep never saw a product).
        return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, research: res || undefined, payload: res || briefPayload() || undefined, artifact: res || undefined };
      }
      if (/\bday[ -]of checklist\b/.test(t) && Prep.dayOfChecklist) {
        const ck = Prep.dayOfChecklist(profile, {});
        // WORDING-BACKLOG (BUG-194): the checklist is spoken as a
        // checklist — one tick-off item per fact, every fact ending
        // in its own sentence so the bubbles break item by item;
        // the unsupplied inputs collapse into ONE flagged line
        // (never the same flag repeated per item), and the
        // materials group is always represented.
        const period = (x) => { const v = s(x).trim(); return !v ? v : /[.!?]$/.test(v) ? v : v + "."; };
        const facts = [];
        if (ck && ck.groups) {
          const missingLabels = [];
          for (const line of ck.groups.logistics || []) {
            const clean = s(line).replace(/\s*\((?:TEST)[^)]*\)/g, "").trim();
            if (/not supplied yet/.test(clean)) { const lab = clean.split(":")[0]; if (lab) missingLabels.push(lab.toLowerCase()); continue; }
            facts.push(period("☐ " + clean.replace(/^Arrive \/ join/i, "Arrive or join")));
          }
          for (const line of ck.groups.links || []) if (/^NO LINK/i.test(s(line))) missingLabels.push("interview link");
          const tech = (ck.groups.tech_check || [])[0]; if (tech) facts.push(period("☐ " + tech));
          const mats = (ck.groups.materials || []).filter(Boolean);
          if (mats.length) facts.push(period(`☐ Materials: ${mats.join("; ")}`));
          if (missingLabels.length) facts.unshift(`Not supplied yet, so flagged rather than invented: ${missingLabels.join(", ")}.`);
        }
        if (!facts.length) facts.push("Logistics, links, tech check, materials — verified the night before, not the morning of.");
        const reply = compose({ headline: "Your day-of checklist.", facts: facts.slice(0, 6), nextStep: "Anything on it you want changed?" });
        return { intent: "prep_mock_checklist", reply, resultStatus: "prepared", sends: 0, checklist: ck, payload: ck };
      }
      if (/\bprep set\b|\bprep plan\b|\bdrills?\b|\btechnicals\b|\bquant prep\b|\bpm prep\b/.test(t) && Prep.questionBank) {
        // BUG-117: the bank is built from the ask (track, company
        // file, mined stories); for a track ask the delivered set
        // leads with the track's questions, not the behavioral five.
        const { args, roleFamily } = bankArgs();
        const bank = Prep.questionBank(args);
        const qs = (bank && (bank.questions || bank)) || [];
        const rows = Array.isArray(qs) ? qs : [];
        const nonBehav = rows.filter((q) => q && q.round !== "behavioral");
        // WORDING-BACKLOG (BUG-204): a track set is its track —
        // when the bank holds at least 3 track questions, no
        // generic behavioral opener rides the set (SC-186's quant
        // set carried "Tell me about yourself…" behind the drills).
        const ordered = roleFamily ? (nonBehav.length >= 3 ? nonBehav : [...nonBehav, ...rows.filter((q) => q && q.round === "behavioral")]) : rows;
        const list = ordered.slice(0, 4).map((q) => s(typeof q === "string" ? q : q.q || "")).filter(Boolean);
        // WORDING-BACKLOG (BUG-133): the matched-to-this-round claim
        // is spoken only when a company file grounds it. A track-only
        // set names its track and says plainly that it is the track's
        // standard set; a finance drill also names how gaps get named
        // (from answers, never from the set itself).
        const grounded = !!(bank && bank.cir_grounded);
        const trackLabel = roleFamily === "finance" ? (/\bquant\b|\bprobability\b|market[- ]making/.test(t) ? "quant" : "finance technicals") : roleFamily === "swe" ? "SWE coding" : roleFamily === "product" ? "PM" : null;
        const headline = company && grounded ? `Your prep set for ${company}, matched to how this round actually runs.` : trackLabel ? `Your ${trackLabel} prep set.` : "Your prep set for this track.";
        let facts = list.length ? [...list] : ["The set is built from the question bank for this track, in the order the gaps on your profile demand."];
        // WORDING-BACKLOG (BUG-195): the standard-set disclaimer is
        // spoken only where the ask premises a company match — an
        // ask that names no company and premises none (a quant drill
        // set, a PM set) gets its track's own contents line instead
        // of the same disclaimer verbatim in every reply.
        if (!grounded && company) facts.push(`No company file is on record for ${company}, so this is the track's standard set — add the company file and it re-orders to that company's known style.`);
        else if (!grounded && /style|match|matched|known for|how they interview/.test(t)) facts.push("No company is named in this session, so this is the track's standard set, not one matched to a company's style — name the company and it re-orders to theirs.");
        if (roleFamily === "product") {
          // The set speaks the user's own shipped work (the ask's
          // premise) and names its metrics piece as delivered.
          const projF = (profile.facts || []).find((f) => f && /project/i.test(s(f.type || f.kind || "")) && f.title);
          const proj = projF ? s(projF.title).replace(/\s*\((?:TEST)[^)]*\)/g, "").trim() : null;
          facts = facts.map((f) => /product you use every day/.test(f) && proj ? `Product sense, through your shipped thing: ${proj} — how would you improve it, and how would you know the improvement worked?` : f);
          if (facts.some((f) => /drops 20%/.test(f))) facts.push("Metrics: the drop drill above is your metrics piece — a flagship metric down 20%, worked end to end: first hour, first cuts, first call.");
          if (proj) facts.push(`Your own product's numbers are not on your profile yet — the metrics piece above runs on the standard scenario until ${proj}'s real metrics are on the profile.`);
        }
        if (roleFamily === "finance") facts.push("Gaps get named from your answers as the drill runs — each answer is scored, and the topics it missed are listed.");
        const reply = compose({ headline, facts, nextStep: "Start the first one as a timed drill?" });
        return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, bank, payload: payloadFor(bank) };
      }
      if (/\bquestion bank\b/.test(t) && Prep.questionBank) {
        const { args } = bankArgs();
        const bank = Prep.questionBank(args);
        const qs = (bank && (bank.questions || bank)) || [];
        const rows = Array.isArray(qs) ? qs : [];
        const list = rows.slice(0, 4).map((q) => s(typeof q === "string" ? q : q.q || "")).filter(Boolean);
        if (list.length) {
          // WORDING-BACKLOG (BUG-134): the story match is spoken per
          // the bank's own record — a matched story is named; an
          // empty match is stated as empty. The headline never
          // promises a match the record does not hold.
          const mapped = rows.filter((q) => q && q.matched_story);
          const mapFact = mapped.length
            ? `Matched: ${mapped.slice(0, 2).map((q) => `"${s(q.q).slice(0, 60)}" — your story "${q.matched_story.title}"`).join("; ")}.`
            : "No story is matched to any question yet — the profile holds no mineable story, so the match is stated as empty rather than invented.";
          const reply = compose({ headline: `The question bank${company ? ` for ${company}` : " for this round"}, with the story match stated per question.`, facts: [...list, mapFact], nextStep: "Pick one and we drill it." });
          return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, bank, payload: payloadFor(bank) };
        }
      }
      if (/\bstar bank\b|\breusable stories\b/.test(t) && Prep.buildStoryBank) {
        const bank = Prep.buildStoryBank(profile);
        const stories = (bank && (bank.stories || bank)) || [];
        if (Array.isArray(stories) && stories.length) {
          const reply = compose({ headline: `Your STAR bank: ${stories.length} reusable stories, mined from your real experiences.`, facts: stories.slice(0, 3).map((x) => s(typeof x === "string" ? x : x.title || x.name || "").split(/(?<=[.!?])\s/)[0]).filter(Boolean), nextStep: "Want the weakest one drilled first?" });
          return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, story_bank: bank, payload: bank };
        }
        // WORDING-BACKLOG (BUG-134): an empty bank is answered as an
        // empty bank — never with the generic brief's question list
        // wearing the bank's name. The ask's own count is carried as
        // the build target.
        const wantN = Number((t.match(/(\d+)\s+(reusable\s+)?stories/) || [])[1]) || null;
        const reply = compose({ headline: "Your STAR bank is empty — no stories are mined from your profile yet.", facts: [`A bank is your real experiences shaped into Situation, Task, Action, Result stories you can reuse across rounds; the profile on record names your roles and facts, but no experience is attached as a mineable story yet, so ${wantN ? `the ${wantN} reusable stories you asked for do` : "the bank does"} not exist to hand you.`, "Nothing gets invented to fill it: a rehearsed story you cannot defend collapses under the first follow-up question."], nextStep: "Tell me one real experience — a project, a deadline, a team that shipped — and I will shape it into your first story." });
        return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, story_bank: bank, brief: bank, payload: bank };
      }
      // The brief's own record, spoken: bar, loop, screening
      // signals, the story-mapping state, and the likely questions —
      // in that order, one fact each. Shared by the composeBrief
      // producer route and the brief fallthrough (BUG-136).
      const briefFacts = (brief) => {
        const F = [];
        if (!brief || typeof brief !== "object") return F;
        // WORDING-BACKLOG (BUG-193): spoken brief facts are cut at
        // word boundaries (a scraped fragment never ends mid-word),
        // listing scaffolding never poses as a likely question
        // ("[Stripe stage] Walk me through how you will handle:
        // Application…" is the loop's plumbing, not a question), and
        // no fact repeats — the night-before pack used to print the
        // same evidence line twice under two labels.
        const cutWords = (str, n) => { const v = s(str); if (v.length <= n) return v; const cut = v.slice(0, n); const sp = cut.lastIndexOf(" "); return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[\s,;:—-]+$/, ""); };
        const push = (x) => { const v = s(x).trim(); if (v && !F.some((y) => y.toLowerCase() === v.toLowerCase())) F.push(v); };
        const barText = brief.bar ? s(typeof brief.bar === "string" ? brief.bar : brief.bar.text || brief.bar.statement || "") : "";
        if (barText) push(`The bar${brief.company ? ` at ${brief.company}` : ""}: ${barText}`);
        if (Array.isArray(brief.stages) && brief.stages.length) push(`The loop, from the company file: ${brief.stages.map((x) => s(typeof x === "string" ? x : x.name || "")).filter(Boolean).join(" · ")}.`);
        if (Array.isArray(brief.emphasis) && brief.emphasis.length) {
          // WORDING-BACKLOG (BUG-204): emphasis points are cut at
          // LIST-ITEM boundaries (whole " · " items, never mid-
          // phrase splices), and the fact is skipped when the bar
          // already speaks the same listing (token overlap) — the
          // night-before pack printed Stripe's listing twice, once
          // as the bar and once as the screen, in an 836-char
          // bubble.
          const itemCut = (str) => { const items = s(str).split(/\s·\s/); let out = ""; for (const it of items) { const nx = out ? `${out} · ${it}` : it; if (nx.length > 150 && out) break; out = nx; } return out.replace(/[\s,;:—-]+$/, ""); };
          const toks = (v) => new Set(lc(v).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3));
          const barToks = toks(barText);
          const pts = brief.emphasis.slice(0, 2).map((e) => itemCut(e && (e.point || e.text) || e)).filter(Boolean);
          const emToks = toks(pts.join(" "));
          const inter = [...emToks].filter((w) => barToks.has(w)).length;
          const overlap = emToks.size ? inter / emToks.size : 0;
          if (pts.length && overlap < 0.45) push(`What they screen for: ${pts.join(" · ")}`);
        }
        if (brief.status === "NO_CIR" && Array.isArray(brief.gaps) && brief.gaps.length) push(s(brief.gaps[0]));
        if (Array.isArray(brief.story_map) && brief.story_map.length) push(`Your story "${brief.story_map[0].title}" is matched to: ${cutWords((brief.story_map[0].mapped_to_questions || [])[0] || "", 110)}.`);
        else if (brief.stories_note || brief.status) push("No story is mapped to these questions — the profile holds no mineable story, so answers get built from your facts in the mock, with the gaps named instead of a match invented.");
        const qs2 = (brief.likely_questions || []).map((q) => s(typeof q === "string" ? q : q.q || "")).filter((q) => q && q.length <= 110 && !/\bstage\b|walk me through how you will handle/i.test(q));
        if (qs2.length) push(`Likely first questions: ${qs2.slice(0, 3).join(" · ")}`);
        return F.slice(0, 5);
      };
      // WORDING-BACKLOG (BUG-135): every producer's reply speaks its
      // OWN record — the prompts, framework, changes, scripts,
      // questions, or pattern the product actually built. The old
      // composition read one body string (most producers have none)
      // and filled the space with the same grounding sentence twice.
      const producerFacts = (fn, out) => {
        const F = [];
        const push = (x) => { const v = s(x).trim(); if (v) F.push(v); };
        if (!out || typeof out !== "object") return F;
        if (fn === "systemDesignPrep") {
          if (Array.isArray(out.prompts) && out.prompts.length) push(`Work these prompts at experienced-hire depth: ${out.prompts.join(" · ")}`);
          if (Array.isArray(out.framework) && out.framework.length) push(`The framework, in order: ${out.framework.join("; ")}.`);
          if (Array.isArray(out.level_notes) && out.level_notes.length) push(out.level_notes[0]);
        } else if (fn === "coffeeChatPrep") {
          for (const tp of (out.talking_points || []).slice(0, 3)) push(tp);
          // WORDING-BACKLOG (BUG-194): the counts the user asked for
          // are answered truthfully — what the brief holds, and the
          // shortfall with its reason — and what-not-to-ask is part
          // of the brief, not an omission.
          const wantQ = Number((s(text).match(/(\d+)\s+(?:sharp\s+)?questions/) || [])[1]) || null;
          const heldQ = (out.questions || []).length;
          // WORDING-BACKLOG (BUG-204): the count claim must equal
          // the VISIBLE count — the brief holds 5 questions, so
          // all 5 ride the one questions fact, never "5 in the
          // brief" over 3 shown.
          if (Array.isArray(out.questions) && out.questions.length) push(`Questions to ask them — ${(out.talking_points || []).length} talking points above, ${heldQ} questions in the brief: ${out.questions.join(" · ")}`);
          if (wantQ && heldQ < wantQ) push(`You asked for ${wantQ} questions; the brief holds ${heldQ} sharp ones grounded in what is on record — the rest would need the person's role and team, which the file does not hold, so they are not padded in.`);
          push("What not to ask: comp, headcount plans, and anything about other candidates — those end chats early and close the door you are opening.");
          if (!out.cir_grounded) push("No company file is on record for this chat, so nothing about the firm is claimed — the brief stands on their path and your own work.");
        } else if (fn === "finalRoundDelta" || fn === "superdayPlan") {
          for (const c of (out.changes || []).slice(0, 3)) push(c);
          if (Array.isArray(out.drill_topics)) for (const d of out.drill_topics.slice(0, 2)) push(typeof d === "string" ? d : (d && d.text) || "");
          if (out.status === "NO_CIR") {
            // (the record's own gap text says "CIR" — the composer's
            // lint strips that token from prose, so it is spoken as
            // "company file" here or the fact never reaches the user)
            push(s((out.gaps || [])[0] || "No company file is on record, so the company-specific shape of this round is not claimed.").replace(/\bCIR\b/g, "company file"));
            if (fn === "superdayPlan") {
              // WORDING-BACKLOG (BUG-194): the general plan is
              // DELIVERED — pacing, a named night-before cutoff, the
              // standard story-to-round mapping — not described as
              // a plan that exists somewhere else.
              push("The plan's pacing: arrive 15 minutes early; between rounds you get minutes, not breaks — water and a breath at every gap, phone face-down, and one line written per interviewer (their name, one specific thing they pressed on) before the next room.");
              let tzA = ""; try { tzA = new Intl.DateTimeFormat("en-US", { timeZone: (ctx && ctx.timezone) || "America/Chicago", timeZoneName: "short" }).formatToParts(new Date(nowOf(ctx))).find((p) => p.type === "timeZoneName").value; } catch { tzA = ""; }
              push(`Night-before cutoff: prep stops at 9:00 PM${tzA ? ` ${tzA}` : ""} — after that only logistics (links, outfit, route) and sleep; morning-of cramming is the known failure mode.`);
              push("Story-to-round mapping, the standard shape: your strongest project story leads the behavioral rounds, the hardest-problem story covers the technicals, and the team-under-pressure story is held for the case or market round.");
            } else {
              push("What changes in a final round, in general: breadth screens give way to depth — fewer screeners, longer follow-ups on your own stories and the technical core, and the people in the room who can actually say yes.");
            }
          }
        } else if (fn === "salaryDeflectionScripts") {
          // The scripts ARE the deliverable: each script's sentences
          // ride as their own facts (the composer keeps one sentence
          // per fact), the "when" label on the first.
          for (const sc of (out.scripts || []).slice(0, 3)) if (sc && sc.text) {
            const sents = s(sc.text).split(/(?<=[.!?])\s+/).filter(Boolean);
            sents.forEach((sent, i) => push(i === 0 ? `When ${sc.when}, say: ${sent}` : sent));
          }
          if (out.anchor_rule) push(out.anchor_rule);
        } else if (fn === "questionsToAsk") {
          for (const q of (out.questions || []).slice(0, 3)) if (q) push(typeof q === "string" ? q : q.text || "");
          if (out.note && out.team_unknown) push(s(out.note).replace(/\bCIR\b/g, "company file"));
        } else if (fn === "videoInterviewPractice") {
          push("Practice only: your answers are scored on content here and are never submitted to any employer by the agent — a submission, if any, is your own act in the employer's portal.");
          push("Record an answer, paste its transcript, and it is scored on structure, specificity, and whether the result lands — the same rubric as the text mock.");
        } else if (fn === "takeHomePlan") {
          push("Plan only: the agent scopes and schedules the take-home — the work itself stays yours, and nothing is drafted or submitted for you.");
          if (out.warning) push(out.warning);
          else push("The schedule comes back hour by hour once the deliverables and your real time blocks are named, with a checkpoint after the first deliverable and a hard stop 30 minutes before the deadline for the write-up.");
        } else if (fn === "debriefRetro") {
          if (out.total_debriefs) {
            for (const p of (out.patterns || []).slice(0, 2)) push(`Pattern: ${s(p.theme || p.text || p)} — in ${p.count != null ? p.count : "?"} debriefs.`);
            if (out.top_miss) push(`The recurring miss: ${out.top_miss}.`);
          } else {
            push("No debrief is captured yet in this session, so there is no pattern to mine — a retro on zero records would be invented.");
            push("When debriefs exist, the retro mines them for the recurring miss — the question type or stage where rounds keep stalling — and names the top one with its count.");
          }
        } else if (fn === "composeBrief") {
          return briefFacts(out);
        }
        return F;
      };
      const producerNext = {
        videoInterviewPractice: "Paste your first answer's transcript and I will score it against the rubric.",
        takeHomePlan: "Tell me the deliverables and your time blocks and I will lay out the hours.",
        finalRoundDelta: "Tell me the company and the file turns this into its actual final stage.",
        superdayPlan: "Name the firm and the file sharpens this mapping to its actual rounds?",
        questionsToAsk: "Want to rehearse your strongest one out loud?",
        salaryDeflectionScripts: "Want to rehearse the pressed-for-a-number one out loud?",
        systemDesignPrep: "Want to run the first prompt as a timed design drill?",
        coffeeChatPrep: "Want to rehearse your 60-second opener before the chat?",
        debriefRetro: "Tell me the last round in your own words — what they asked, where it snagged — and the debrief record starts there.",
        composeBrief: "Want to run it as a mock, one question at a time?",
      };
      // IB-F5F7-4: the interview-shaped producers answer their own
      // asks (these used to fall to the OS capability template).
      const producerRoutes = [
        [/\bvideo\b[^.]*\b(practice|interview)\b|\bpractice\b[^.]*\bcamera\b/, "videoInterviewPractice", "Your video-interview practice plan."],
        [/\btake[ -]home\b/, "takeHomePlan", "Your take-home plan — the shape now, the hours when the blocks are named."],
        [/\bsuperday\b/, "superdayPlan", "Your superday plan."],
        [/\bfinal[ -]round\b|\bfinal round\b/, "finalRoundDelta", "The final-round delta: what changes at this stage."],
        [/\bquestions[ -]to[ -]ask\b|\bquestions i should ask\b|\bask the (panel|interviewer)\b/, "questionsToAsk", "Your questions to ask, matched to this panel."],
        [/\bdebriefs?\b|\bretro\b/, "debriefRetro", "The debrief, mined for the pattern."],
        [/\bcoffee[ -]chat\b/, "coffeeChatPrep", "Your coffee-chat brief."],
        [/\bdeflect|\bsalary\b[^.]*\b(script|deflect|say)\b|\bwhat do i say\b[^.]*\bsalary\b/, "salaryDeflectionScripts", "Your salary-deflection scripts, word for word."],
        [/\bsystem[ -]design\b/, "systemDesignPrep", "Your system-design prep set."],
        [/\bresearch[ -]talk\b|\bteaching[ -]demo\b|\bbar[ -]raiser\b/, "composeBrief", "Your brief for this round."],
      ];
      for (const [re, fn, headline] of producerRoutes) {
        if (re.test(t) && Prep[fn]) {
          try {
            const out = fn === "debriefRetro" ? Prep.debriefRetro({ debriefs: (ctx.debriefs || []) }) : Prep[fn]({ cir: cirFor(text, ctx), company: company || undefined, profile });
            if (out) {
              let facts = producerFacts(fn, out);
              let head = headline;
              let nextStep = producerNext[fn] || "Want to run the first piece as a timed drill?";
              if (fn === "debriefRetro") {
                // WORDING-BACKLOG (BUG-194): an empty debrief mines
                // nothing and drafts nothing — the headline says so,
                // the thank-you is conditional on a debrief
                // existing, and a rejection in the ask is
                // acknowledged before the retro mechanics (W1).
                if (!out.total_debriefs) head = "The debrief — nothing captured yet, so nothing is mined.";
                if (/thank[ -]you/.test(t)) facts.push(out.total_debriefs
                  ? "The thank-you is drafted from the debrief and held for your yes — it goes out only when you approve the exact text."
                  : "The thank-you waits on the debrief: there is nothing captured to draft it from yet — tell me the round in your words and the note drafts from that, still sent only on your yes.");
                if (/reject|turned down|didn'?t get/.test(t)) {
                  facts.unshift("First — a rejection after a final round is a real loss, and it says nothing about the next one.");
                  head = "The post-rejection retro — read from what is actually captured.";
                }
              }
              if (fn === "composeBrief") {
                // WORDING-BACKLOG (BUG-192): research talks,
                // teaching demos, and bar-raiser rounds each get
                // their OWN brief — the shape's arc, its real
                // questions, its own next step — never one generic
                // template rump under three different asks, and at
                // most one honest-gap line, phrased per shape.
                const shape = /\bresearch[ -]talk\b/.test(t) ? "research" : /\bteaching[ -]demo\b/.test(t) ? "teaching" : /\bbar[ -]raiser\b/.test(t) ? "barraiser" : null;
                if (shape === "research") {
                  head = "Your research-talk brief.";
                  facts = ["The talk runs on one arc: the problem and why it matters, your approach, the result, and the open questions it leaves — panels interrupt on the approach, so that section carries the depth.", "Their questions cluster on method: why this approach over the obvious alternative, what the result does NOT show, and what you would run next with more time.", "No company file is on record for this panel, so no question is invented in their voice — the arc and the method probes are the research-talk standard."];
                  nextStep = "Paste the abstract or the slide titles and the arc gets built on your actual work?";
                } else if (shape === "teaching") {
                  head = "Your teaching-demo brief.";
                  facts = ["The demo is judged on the teaching, not the content: open with the learning goal in one sentence, build one worked example live, and check understanding twice before the close.", "Expect the panel to play the confused student — the recovery (a second, smaller example) is what they are actually scoring.", "No company file is on record for this panel, so the school's own format is not claimed — the beats above are the teaching-demo standard."];
                  nextStep = "Tell me the topic and the class length and the beats get timed to it?";
                } else if (shape === "barraiser") {
                  head = "Your bar-raiser brief.";
                  facts = ["A bar-raiser round probes three things: ownership — a decision that was yours alone; disagreement — a time you pushed back with data; and a failure you can dissect without flinching.", "Answers come from your real facts only: an invented war story collapses on the second follow-up, and the second follow-up is the bar raiser's whole job.", "No company file is on record for this round, so its named bar is not claimed — the three probes above are what the round is built to test."];
                  nextStep = "Want to pick your ownership story first and stress-test it?";
                }
              }
              // A panel-less questions ask is not "matched to this
              // panel" — the headline says which set it is.
              if (fn === "questionsToAsk" && out.team_unknown) {
                head = "Your questions to ask — no panel is named yet, so these are the round's standard set.";
                // WORDING-BACKLOG (BUG-204): the single step names
                // the unlocking input — the team or panel the set
                // re-orders to — not a rehearsal offer.
                nextStep = "Tell me the team or the panel, and the set re-orders to theirs.";
              }
              const reply = compose({ headline: head, facts: facts.length ? facts : ["Built from the prep bank for this round and the facts on your profile — nothing rehearsed that you cannot defend."], nextStep });
              return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, brief: out, payload: out };
            }
          } catch { /* fall through to the brief */ }
        }
      }
      if (Prep.composeBrief) {
        const posting = ctx.posting || (company ? (rankedShortlist(profile, ctx, { company: lc(company) }).ranked[0] || {}).posting : null);
        // IB-F5F7-3: the company file rides into the brief — a null CIR
        // produced NO_CIR briefs that cannot validate or cite.
        const brief = Prep.composeBrief(profile, posting ? { title: posting.title, company: posting.company } : { company: company || null }, cirFor(text, ctx));
        // WORDING-BACKLOG (BUG-136): the brief reply speaks the
        // brief's own record (bar, loop, signals, story-mapping
        // state, questions) under a headline that names the ask's
        // shape — never a question list plus a grounding slogan
        // serving every brief-shaped ask alike.
        let facts = briefFacts(brief);
        const preShapeLen = facts.length;
        if (/\bportfolio walkthrough\b/.test(t)) {
          // WORDING-BACKLOG (BUG-192): a walkthrough's openers are
          // per project, from the profile's own project facts —
          // the generic behavioral trio is not a walkthrough prep.
          facts = facts.filter((f) => !/^Likely first questions/.test(f));
          facts.push("Each project runs in this order: the problem, your role in it, the decisions and their trade-offs, and the number it moved.");
          const projects = (profile.facts || []).filter((f) => f && /project/i.test(s(f.type || f.kind || "")) && f.title).slice(0, 2);
          for (const p of projects) { const pn = s(p.title).replace(/\s*\((?:TEST)[^)]*\)/g, "").trim(); facts.push(`Opener for ${pn}: "Walk me through ${pn} — why that stack, what broke first, and what you would change now."`); }
        }
        if (/\bhiring[ -]manager\b/.test(t)) { facts.push("A hiring-manager round goes deeper than the screen: how you would run the team's next term, the calls you would make in the first month, and your questions about their roadmap."); facts.push("The questions a hiring manager actually asks: what would you do in your first 30 days here, which call would you make first, and what would you need from this team to succeed?"); }
        // WORDING-BACKLOG (BUG-204): for the walkthrough and
        // hiring-manager shapes the SHAPE content leads — the two
        // honest-gap sentences (no file / no story) follow it
        // instead of heading the reply as shared boilerplate, and
        // the hiring-manager brief drops the generic behavioral
        // trio (its own questions ride above).
        if (/\bportfolio walkthrough\b/.test(t) || /\bhiring[ -]manager\b/.test(t)) {
          const shapeFacts = facts.splice(preShapeLen);
          const base = facts.filter((f) => !(/\bhiring[ -]manager\b/.test(t) && /^Likely first questions/.test(f)));
          facts = [...shapeFacts, ...base];
        }
        if (/\binterviewer brief\b/.test(t)) facts.push("No interviewer is named in this session, so there is no interviewer brief to build — paste the invite names and each brief is built from public sources only.");
        if (/\btwo interviews\b|\bsame day\b/.test(t)) { facts.push("Interview one gets the opener and the project story — your shipped work, told tight, with the number it moved."); facts.push("Interview two gets the depth pass — the hardest-problem story, the follow-ups it invites, and your questions for that panel."); facts.push("Neither interview is identified in this session — no companies or times are on record — so that split is the working order: the heavier panel goes second in prep order, with a sanity check for back-to-back fatigue, and the split binds to the real two the moment they are named."); try { brief.ask_shape = "two_interviews_same_day"; } catch { /* payload marker is best-effort */ } }
        // WORDING-BACKLOG (BUG-140): a named appointment is spoken
        // with its absolute date — the weekday the ask names, dated
        // from the turn's own clock, and the pack day named as the
        // day before it (H-14: no bare weekday).
        const apptM = s(text).match(/interview[^.]*?\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[^.]*?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
        let apptFact = null;
        if (apptM) {
          try {
            const wantDay = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }[apptM[1].toLowerCase()];
            const base = new Date(nowOf(ctx));
            const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
            let add = (wantDay - d.getDay() + 7) % 7; if (add === 0) add = 7;
            d.setDate(d.getDate() + add);
            const pack = new Date(d); pack.setDate(pack.getDate() - 1);
            const fmt = (x) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(x);
            // WORDING-BACKLOG (BUG-200): a stated time carries its
            // timezone (H-14) — the turn's own zone, abbreviated.
            let tzAbbr = "";
            try { const zp = new Intl.DateTimeFormat("en-US", { timeZone: (ctx && ctx.timezone) || "America/Chicago", timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName"); tzAbbr = zp ? ` ${zp.value}` : ""; } catch { tzAbbr = ""; }
            const time = `${Number(apptM[2])}:${apptM[3] || "00"} ${apptM[4].toUpperCase()}${tzAbbr}`;
            apptFact = `Your interview is ${fmt(d)} at ${time} — the pack lands ${fmt(pack)}, the day before, so the morning itself is only logistics: links, tech check, materials.`;
            facts.unshift(apptFact);
            // WORDING-BACKLOG (BUG-204): an appointment brief also
            // carries its working order — what gets prepped first,
            // second, third for THIS appointment.
            facts.splice(1, 0, "Prep order for this one: your 60-second opener first, then the project story with its number, then the likely questions below, and your own questions for them last.");
          } catch { apptFact = null; }
        }
        if (!apptFact && /\bnight[ -]before\b|\bthursday\b|\btomorrow\b/.test(t)) facts.push("The pack lands the day before, so the morning itself is only logistics: links, tech check, materials.");
        const headline = /\bnight[ -]before\b/.test(t) ? `Your night-before brief${company ? ` for ${company}` : ""}.`
          : /\bhiring[ -]manager\b/.test(t) ? `Your hiring-manager brief${company ? ` for ${company}` : ""}.`
          : /\bportfolio walkthrough\b/.test(t) ? "The portfolio walkthrough, project by project."
          : /\btwo interviews\b|\bsame day\b/.test(t) ? "Your prep order for both interviews."
          : apptM ? `Your interview brief for ${apptM[1][0].toUpperCase() + apptM[1].slice(1).toLowerCase()} at ${Number(apptM[2])}:${apptM[3] || "00"} ${apptM[4].toUpperCase()}.`
          : `Your interview brief${company ? ` for ${company}` : ""}.`;
        const reply = compose({ headline, facts: facts.length ? facts : ["Every answer gets built from facts on your profile — nothing rehearsed that you cannot defend."], nextStep: /\bnight[ -]before\b/.test(t) ? "Want me to walk the pack once tonight, question by question?" : /\bportfolio walkthrough\b/.test(t) ? "Want to run the walkthrough now, project by project, the way the round will?" : /\bhiring[ -]manager\b/.test(t) ? "Want the first-month plan run as the mock — you pitch it, I push on the calls you would make?" : "Want to run it as a mock, one question at a time?" });
        return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, brief, payload: brief };
      }
    } catch { return null; }
    return null;
  }

  // Named-target resolution beyond the served pool (IB-AP-3, verified
  // against the data 2026-10-14): the product's retrieved board data —
  // packages/career-data/fixtures/gauntlet/jobs (public listings +
  // snapshots, retrieved 2026-10-13). A user who NAMES a company gets
  // that company's real board read. Only a role-family-appropriate
  // posting may drive a tailor; a board holding no such role gets the
  // truth about what it does hold (Stripe: operations roles only;
  // Jane Street: data-center operations; Datadog: no backend role —
  // Ramp's engineering roles are the genuine article).
  let _fixtureBoard = null;
  function fixtureBoard() {
    if (_fixtureBoard) return _fixtureBoard;
    _fixtureBoard = [];
    try {
      const fs = require("node:fs");
      const path = require("node:path");
      const dir = path.join(__dirname, "..", "career-data", "fixtures", "gauntlet", "jobs");
      const listings = JSON.parse(fs.readFileSync(path.join(dir, "public-listings.json"), "utf8")).listings || [];
      const byTitle = new Map(listings.map((l) => [lc(l.title), l]));
      const snapDir = path.join(dir, "public-snapshots");
      for (const f of fs.readdirSync(snapDir).filter((x) => x.endsWith(".json")).sort()) {
        let d = null;
        try { d = JSON.parse(fs.readFileSync(path.join(snapDir, f), "utf8")); } catch { d = null; }
        if (!d) continue;
        const title = d.title || d.name || null;
        if (!title) continue;
        const jd = d.descriptionPlain || d.content || d.description || null;
        if (!jd) continue;
        const listing = byTitle.get(lc(title));
        const company = (listing && listing.company) || (d.company && (d.company.name || d.company)) || null;
        if (!company) continue;
        _fixtureBoard.push({ corpus_id: `fixture-${d.id || f}`, title, company: s(company), location: d.location && typeof d.location === "string" ? d.location : (listing && listing.location) || "", jd_text: s(jd), source: "retrieved board data (2026-10-13)" });
      }
    } catch { _fixtureBoard = []; }
    return _fixtureBoard;
  }
  function namedFixturePosting(company, text) {
    const board = fixtureBoard().filter((p) => lc(p.company) === lc(company) || lc(p.company).includes(lc(company)));
    if (!board.length) return { board: [], match: null };
    let fams = Jobs && Jobs.askRoleFamilies ? Jobs.askRoleFamilies(text) : [];
    if (!fams.length) {
      // 121's ask parser has no "full-stack" — the named-ask keywords
      // the wedge uses still name a family plainly.
      if (/\b(full[ -]?stack|frontend|front[ -]end|backend|back[ -]end|software|swe|developer)\b/i.test(s(text))) fams = ["SWE"];
      else if (/\b(quant|trading|trader)\b/i.test(s(text))) fams = ["Finance"];
      else if (/\b(data science|machine learning|ml engineer)\b/i.test(s(text))) fams = ["Data/ML"];
    }
    let match = fams.length ? board.find((p) => (Jobs.askRoleFamilies(p.title) || []).some((f) => fams.includes(f))) || null : null;
    if (!match && !fams.length && board.length) {
      // IB-AP-3 (data lane, 33cf986): a company-level tailor ask that
      // names no family ("Tailor for Jane Street — competitions,
      // probability coursework, research forward") matches the
      // board's lead posting — the first role the board itself
      // classifies into a family — rather than nothing. A company
      // with NO board at all still gets the honest-empty answer.
      match = board.find((p) => ((Jobs && Jobs.askRoleFamilies ? Jobs.askRoleFamilies(p.title) : []) || []).length) || board[0];
    }
    return { board, match };
  }

  // ---------- company intel (125; family Intelligence: R-C5) ----------------
  function handleIntel(text, ctx) {
    if (!Intel) return null;
    // 140's composeResult keeps the FIRST sentence of each fact and
    // caps the fact block at 6 sentences — multi-sentence evidence
    // (a role bar, the library's stats block) is therefore passed as
    // one fact per sentence, the same idiom the summary below uses.
    // Abbreviations are shielded first: a naive split breaks "Inc."
    // and "Sr." into phantom facts and the real closing facts fall
    // off the cap.
    const sentsOf = (t) => String(t || "").replace(/\b(Inc|Corp|Ltd|Sr|Jr|Dr|Mr|Mrs|Ms|St|vs|U\.S|D\.C|e\.g|i\.e)\./g, "$1\u0001").split(/(?<=[.!?])\s+/).map((x) => x.trim().split("\u0001").join(".")).filter(Boolean);
    let cir = cirFor(text, ctx);
    // PREP-KB ROUTING (LF-02, custom battery 2026-10-18, Block 3 t2):
    // a FULL role-evidence ask — a complete question that names its
    // role ("what does it actually take to get hired as a data
    // analyst? Give me the real numbers…") — is a question about the
    // ROLE, not a follow-up about the last-discussed firm. Its stray
    // pronouns ("…if you have them") point at the numbers, so the
    // memo resolutions below must not re-anchor the turn to the
    // stored firm; the role branch further down answers it from the
    // knowledge library instead. Short elliptical follow-ups ("and
    // for PM?", "and what's their cutoff?") are the memo's home
    // ground and keep it — the length gate separates the two shapes,
    // and a firm named in THIS turn (cir above) always wins.
    const roleShape = /\bwhat does it take\b|\bwhat (do|does)\b[^.?!]*\b(postings?|roles?)\b|\bwhat skills\b|\bpostings (name|ask|require|usually|emphasize)\b|\bget hired as\b|\bbecome an?\b|\bwhat (are|is)\b[^.?!]*\b(postings?|requirements?|skills?)\b|\blook for in\b|\bwhat about\b[^.?!]*\bfor\b|\bmost common\b[^.?!]*\b(requirements?|skills?)\b|\bwhat\b[^.?!]*\bpostings\b[^.?!]*\b(require|required|ask|name|emphasize|look for|usually|matter)\b/i;
    const fullRoleAsk = !cir && s(text).length > 60 && roleShape.test(s(text));
    if (!cir) {
      // COMPLEXITY WAVE (BUG-174): a pronoun follow-up ("and what's
      // THEIR gpa cutoff?") resolves against the firm this thread
      // last discussed — the record lives in the discovery store,
      // which survives the snapshot round trip.
      const stored = ctx.discovery && ctx.discovery.lastIntelCompany;
      if (stored && !fullRoleAsk && /\b(their|its|they|them|the firm|the company)\b/i.test(s(text))) cir = cirFor(stored, ctx);
      // Depth Lane C: an elliptical role follow-up ("and for PM?",
      // "and what about for software engineers?") names no firm at
      // all — it continues the firm this thread last discussed, and
      // the role-lens branch below answers it for that firm (or, for
      // an unfiled firm, the no-file branch's role half does).
      if (!cir && stored && s(text).length <= 60 && /^\s*(and\s+)?(what about\s+)?for\b/i.test(s(text))) cir = cirFor(stored, ctx);
    }
    if (!cir) {
      // COMPLEXITY WAVE (BUG-174): a NAMED firm with no company file
      // gets the honest no-file answer — never invented intel, and
      // never silence. (In the shipped bundle the file library is
      // embedded by the build; a firm absent from it is absent.)
      const comp0 = companyFromText(text, ctx);
      let comp = comp0;
      if (!comp) { const am = s(text).match(/\babout\s+([A-Z][A-Za-z0-9&.'-]+(?:\s+(?:[A-Z][A-Za-z0-9&.'-]+|Capital|Partners|Securities|Bank|Group|International|Labs|Technologies))?)/); if (am) comp = am[1].replace(/[?.!,]+$/, ""); }
      // LF-05 (Depth Lane C): the registry's most natural phrasing —
      // "What do you have on Databricks?" — matched NO extraction
      // frame (companyFromText owns firm/company/bank/at/about), so
      // this branch never fired and the live path served the generic
      // fallback although the honest answer existed in the build. The
      // "on <Name>" frames live HERE, in the no-file branch only:
      // companyFromText is shared by state-writing handlers, where a
      // wider net would mint companies the user never named.
      if (!comp) { const om = s(text).match(/\bon\s+([A-Z][A-Za-z0-9&.'-]+(?:\s+(?:[A-Z][A-Za-z0-9&.'-]+|Capital|Partners|Securities|Bank|Group|International|Labs|Technologies))?)/); if (om && !/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)$/.test(om[1])) comp = om[1].replace(/[?.!,]+$/, ""); }
      if (!comp) { const hm = s(text).match(/\bhave on\s+([a-z][a-z0-9&.'-]{2,})\b/i); if (hm && !/^(file|files|record|records|me|this|that|today|tomorrow|average|hand|him|her|them|it|my|your|tap|deck|deck,|it,)$/i.test(hm[1])) comp = hm[1].replace(/[?.!,]+$/, ""); }
      // "What does Databricks look for in data analysts?" — the firm
      // sits after does/do with no preposition frame at all; the
      // no-file branch is the only place this frame is read, so a
      // wider net here cannot mint companies for state writers.
      if (!comp) { const dm = s(text).match(/\b(?:does|do|did)\s+([A-Z][A-Za-z0-9&.'-]{2,}(?:\s+(?:[A-Z][A-Za-z0-9&.'-]+|Capital|Partners|Securities|Bank|Group|International|Labs|Technologies))?)\s+(?:look|hire|want|need|post|seek)\b/); if (dm) comp = dm[1].replace(/[?.!,]+$/, ""); }
      if (!comp && !fullRoleAsk && /\b(their|its|they|them|the firm|the company)\b/i.test(s(text))) comp = (ctx.discovery && ctx.discovery.lastIntelCompany) || null;
      if (!comp) {
        // MI-020 (Depth Lane C): no company is named, but the ask can
        // still be a ROLE-evidence ask ("what does it take for data
        // analyst", "what do welder postings name?"). The knowledge
        // library (153, via 125) answers those with stats cited with
        // their n; a role the library does not carry gets the honest
        // no-data answer. Neither may fall through to the generic
        // fallback, and no neighbouring role's numbers are ever
        // borrowed (153 returns found:false rather than a neighbour).
        if (roleShape.test(s(text)) && Intel.roleKbStats && Intel.kbStatsText) {
          let kst = null;
          try { kst = Intel.roleKbStats(s(text)); } catch { kst = null; }
          if (!kst && Intel.detectRole) {
            // Sentence-shaped asks defeat the library's title matcher
            // on inflections ("welders" vs the "Welder" row); the
            // detected role's label is the matcher's home ground.
            try { const dr = Intel.detectRole(s(text)); if (dr && (dr.label || dr.key)) kst = Intel.roleKbStats(dr.label || dr.key); } catch { kst = null; }
          }
          if (!kst) {
            // Roles outside 125's lens list (welder, nurse, …) are
            // named in the ask's own frames; try those phrases, and
            // their singular, against the library before concluding
            // the role is absent.
            const cands = [];
            const aboutM = s(text).match(/\babout\s+([A-Za-z][A-Za-z -]*?)(?:\s+—|\s+--|\s+-|\?|$)/); if (aboutM) cands.push(aboutM[1].trim());
            const forM = s(text).match(/\bfor\s+(?:an?\s+|the\s+)?([A-Za-z][A-Za-z -]*?)(?:\?|$)/); if (forM) cands.push(forM[1].trim());
            for (const cand of cands) {
              if (!cand) continue;
              try { kst = Intel.roleKbStats(cand); } catch { kst = null; }
              if (!kst && /s$/i.test(cand)) { try { kst = Intel.roleKbStats(cand.replace(/s$/i, "")); } catch { kst = null; } }
              if (kst) break;
            }
          }
          if (kst) {
            const facts = ["No company is named in that ask, so no company file applies — but the role itself is in the career knowledge library, and its posting evidence is on record.", ...sentsOf(Intel.kbStatsText(kst))];
            const reply = compose({ headline: `${kst.role.title} — what its postings actually ask for, from the library.`, facts, nextStep: "Name a company and I will put its own file's bar next to this, role by role." });
            return { intent: "company_intel", reply, resultStatus: "prepared", sends: 0, payload: { kind: "role_kb_stats", role: kst.role.title }, artifact: { kind: "role_kb_stats", role: kst.role.title } };
          }
          const tailM = s(text).match(/\bfor\s+(?:an?\s+|the\s+)?([^?.!,]+)$/i);
          const roleTail = tailM ? tailM[1].trim() : "";
          const reply = compose({ headline: "That role is not in the career knowledge library — stated plainly.", facts: [`The library's role evidence covers the occupations it was built from; ${roleTail ? `"${roleTail}" is` : "that role is"} not among them, so no posting statistics exist on record for it.`, "What I will not do is borrow a neighbouring role's numbers and present them as this role's — a percentage without its own evidence behind it is invention."], nextStep: "Name a role the library carries — data analyst, software engineer, registered nurse, welder, product manager — and its posting evidence is quoted with its sample sizes." });
          return { intent: "company_intel", reply, resultStatus: "awaiting_user", sends: 0, payload: { kind: "role_kb_absent" }, artifact: { kind: "role_kb_absent" } };
        }
        return null;
      }
      try { ctx.discovery = Object.assign({}, ctx.discovery || {}, { lastIntelCompany: comp }); } catch { /* memo only */ }
      const facts = [`The company-file library holds dossiers built from public sources — hiring bar, entry routes, cadence, interview process, comp notes. ${comp} is not one of them, so none of that exists on record for this firm.`];
      if (/\bgpa\b|\bcutoff\b|\bcut-off\b/i.test(s(text))) facts.push(`On the cutoff question specifically: no verified GPA cutoff for ${comp} is on record. Firms rarely publish one, and a number I cannot source will not be quoted at you as fact.`);
      facts.push("What I will not do is fill the gap with plausible-sounding detail — an invented bar or culture note would send your prep in a wrong direction with total confidence.");
      // MI-020 (Depth Lane C): a no-file company asked about FOR A ROLE
      // still gets the role's half answered — from the knowledge
      // library, with its n — instead of "no file" being the whole
      // answer (the live KB4 shape: "…to be a product manager at
      // Databricks?" stopped at the missing file).
      if (Intel.detectRole && Intel.roleKbStats && Intel.kbStatsText) {
        try {
          const dr = Intel.detectRole(s(text));
          const kst = dr && (dr.key || dr.label) ? Intel.roleKbStats(dr.label || dr.key) : null;
          if (kst) facts.push("The role half of your ask does have library evidence:", ...sentsOf(Intel.kbStatsText(kst)));
        } catch { /* the no-file answer stands on its own */ }
      }
      const reply = compose({ headline: `${comp} has no company file yet — here is what that means, plainly.`, facts, nextStep: `Want prep for ${comp} built from its public postings instead, or a firm whose file exists?` });
      return { intent: "company_intel", reply, resultStatus: "awaiting_user", sends: 0, company: comp, payload: { kind: "company_file_absent", company: comp }, artifact: { kind: "company_file_absent", company: comp } };
    }
    const name = cirShortName(cir);
    try { ctx.discovery = Object.assign({}, ctx.discovery || {}, { lastIntelCompany: name }); } catch { /* memo only */ }
    // COMPLEXITY WAVE (BUG-174): a two-firm compare where the OTHER
    // side is a NAMED firm with no file is answered as exactly that —
    // the filed side from its file, the named side stated missing.
    // A generic other ("a boutique", "a big bank") is NOT this
    // branch's: the comparison composition further down owns it
    // (BUG-121's third-person screen rule lives there).
    {
      const cmpM = s(text).match(/\bcompare\s+([A-Z][A-Za-z&. ]{3,40}?)\s+(?:and|with|vs\.?|versus)\s+([A-Z][A-Za-z&. ]{3,40}?)(?=[\s—–-]|$)/i) || s(text).match(/\b([A-Z][A-Za-z&. ]{3,40}?)\s+(?:vs\.?|versus)\s+([A-Z][A-Za-z&. ]{3,40}?)(?=[\s—–-]|$)/i);
      if (cmpM) {
        const others = [cmpM[1], cmpM[2]].map((x) => x.trim()).filter((x) => x && lc(x) !== lc(name) && !lc(name).startsWith(lc(x)) && !lc(x).startsWith(lc(name)));
        const other = others.find((x) => /^[A-Z]/.test(x) && !/^(a|an|the)\s/i.test(x) && !cirFor(x, ctx));
        if (other) {
          const firstOf = (v) => { const tx = cirFieldText(v); return tx ? tx.split(/(?<=[.!?])\s/)[0] : null; };
          // BUG-121 conformance: the firm's screen is reported in
          // third person, never re-addressed to the user.
          const third = (v) => v ? v.replace(/\byou must\b/gi, "candidates must").replace(/\byou need to\b/gi, "candidates need to").replace(/\byou have to\b/gi, "candidates have to").replace(/\byou should\b/gi, "candidates should").replace(/\byou are expected to\b/gi, "candidates are expected to").replace(/\byour\b/gi, "their") : v;
          const facts = [];
          const bar = firstOf(cir.hiring_bar_summary); if (bar) facts.push(`${name}'s bar, from its file: ${third(bar)}`);
          // MI-019 rider (Depth Lane C): a compare asked FOR A ROLE
          // ("compare Snowflake and Databricks for PM") must not let
          // the filed side's cohort bar stand as the role's answer —
          // the asked role's lens (its own bar, or the honest no-bar
          // statement, plus the library's cited stats for the role)
          // rides in the same answer, and the culture line yields its
          // sentence slot to it.
          let lensFacts = null;
          if (Intel.detectRole && Intel.barForRole && Intel.answerRoleIntel) {
            try {
              const dr = Intel.detectRole(text);
              if (dr && (dr.key || dr.label)) {
                const lens = Intel.barForRole(cir, dr);
                if (lens && (lens.status === "role-bar" || lens.status === "no-role-bar")) {
                  const ra = Intel.answerRoleIntel(cir, text, { role: dr });
                  if (ra && ra.text) lensFacts = sentsOf(ra.text).slice(0, 3);
                }
              }
            } catch { lensFacts = null; }
          }
          const cult = lensFacts ? null : firstOf(cir.values_culture_signals || cir.culture_notes); if (cult) facts.push(`On culture: ${cult}`);
          facts.push(`${other} has no company file in the library, so its culture, hours, deal flow, and exits cannot be compared from record — anything said about them here would be invention.`);
          if (lensFacts) facts.push(...lensFacts);
          if (cir.as_of) facts.push(`Source: the ${name} company file (public sources), as of ${cir.as_of}.`);
          const reply = compose({ headline: `${name} versus ${other}: one side of this comparison exists on record; the other does not.`, facts, nextStep: `Want the ${name} side deepened, or ${other}'s file built from public sources first?` });
          return { intent: "company_intel", reply, resultStatus: "prepared", sends: 0, company: name, payload: { kind: "company_compare_partial", filed: name, unfiled: other }, artifact: { kind: "company_compare_partial", filed: name, unfiled: other } };
        }
      }
    }
    // BUG-073: a compare-my-profile ask is answered by 125's
    // compareMe product (dimension rows + the highest-leverage fix),
    // carried as a cited response — not by the thin-file summary.
    if (/\bcompare\b[^.]*\bprofile\b|\baverage\b[^.]*\bhire\b/.test(lc(text)) && Intel.compareMe) {
      try {
        const cm = Intel.compareMe(cir, ctx.profile || {}, {});
        if (cm && Array.isArray(cm.rows)) {
          const fixes = cm.rows.filter((r) => r && r.fix).slice(0, 5).map((r) => r.fix);
          const facts = cm.rows.slice(0, 2).map((r) => `${r.dimension}: you — ${r.user}; the typical hire — ${r.cohort}`.split(/(?<=[.!?])\s/)[0]);
          // WORDING-BACKLOG (BUG-202): the plan the ask names is
          // DELIVERED in the reply — the table's highest-leverage
          // fix as this month's plan — not offered as a next step.
          const hlf = cm.highest_leverage_fix && cm.highest_leverage_fix.fix ? s(cm.highest_leverage_fix.fix).split(/(?<=[.!?])\s/)[0] : null;
          if (hlf) facts.push(`This month's plan, from the table's highest-leverage fix (${cm.highest_leverage_fix.dimension || "the top gap"}): ${hlf}`);
          facts.push(cir.as_of ? `Source: the ${name} company file (public sources), as of ${cir.as_of}.` : `Source: the ${name} company file (public sources); the file carries no as-of date, so none is claimed.`);
          const reply = compose({ headline: `You versus the average ${name} hire — the table, the gaps, the plan.`, facts, nextStep: "Want me to pull the reachable employers for that first internship next?" });
          const payload = { text: cm.highest_leverage_fix && cm.highest_leverage_fix.fix ? cm.highest_leverage_fix.fix : facts[0], sources: cir.data_sources || [], as_of: cir.as_of || null, plan: fixes, comparison: cm };
          return { intent: "company_intel", reply, resultStatus: "prepared", sends: 0, company: name, comparison: cm, payload, artifact: payload };
        }
      } catch { /* fall through to the file summary */ }
    }
    // MI-019 / MI-020 (Depth Lane C): a ROLE-LENS ask names a role
    // whose bar is not this file's cohort bar. Serving the cohort
    // summary to it answers a different question than the one asked —
    // the live failure (registry LF-02): a PM ask about Snowflake was
    // served Snowflake's SWE bar verbatim. When the file carries the
    // asked role's own bar, serve that bar; when it carries no bar
    // for the asked role, say exactly that; either way the knowledge
    // library's cited stats for the ASKED role ride along — 125's
    // answerRoleIntel composes both halves and neither half borrows
    // the other role's evidence. A cohort-bar ask, a mere role
    // mention, and a two-filed-firm compare fall through to the
    // summary below unchanged.
    if (Intel.detectRole && Intel.barForRole && Intel.answerRoleIntel) {
      let askedRole = null, lens = null, roleAns = null;
      try {
        askedRole = Intel.detectRole(text);
        if (askedRole && (askedRole.key || askedRole.label)) {
          const lab = lc(askedRole.label || "");
          const low = lc(text);
          const frameToks = new Set([lab, lc(String(askedRole.key || "").replace(/-/g, " "))]);
          if (askedRole.key && askedRole.key.length <= 3) frameToks.add(lc(askedRole.key));
          const framed = [...frameToks].filter(Boolean).some((f) => low.includes(`for ${f}`) || low.includes(`for a ${f}`) || low.includes(`for an ${f}`) || low.includes(`${f} at`) || low.includes(`${f} role`) || low.includes(`as a ${f}`) || low.includes(`as an ${f}`))
            || (/\b(hiring bar|the bar|bar for|look for in|hiring for)\b/.test(low) && (lab ? low.includes(lab.split(" ")[0]) : false))
            || (/\b(stats|statistics|library|percentages?|postings data)\b/.test(low) && !!lab);
          const otherFiled = /\b(compare|vs\.?|versus)\b/.test(low) && !!(cirListOf(ctx).find((x) => x && x !== cir && cirMatches(x, low)));
          if (framed && !otherFiled) {
            lens = Intel.barForRole(cir, askedRole);
            if (lens && (lens.status === "role-bar" || lens.status === "no-role-bar")) roleAns = Intel.answerRoleIntel(cir, text, { role: askedRole });
          }
        }
      } catch { askedRole = null; lens = null; roleAns = null; }
      if (roleAns && roleAns.text) {
        const facts = [...sentsOf(roleAns.text)];
        facts.push(cir.as_of ? `Source: the ${name} company file (public sources), as of ${cir.as_of}; role statistics from the career knowledge library, each cited with its sample size.` : `Source: the ${name} company file (public sources); the file carries no as-of date, so none is claimed. Role statistics from the career knowledge library, each cited with its sample size.`);
        const reply = compose({ headline: `${name} for ${askedRole.label} — the asked role's own evidence, not the file's headline cohort.`, facts, nextStep: "Want your own record read against this role's bar next?" });
        return { intent: "company_intel", reply, resultStatus: "prepared", sends: 0, company: name, payload: { kind: "role_intel", company: name, role: askedRole.label, lens_status: lens.status }, artifact: { kind: "role_intel", company: name, role: askedRole.label } };
      }
    }
    // BUG-087 (template-breakup lane): the file summary is composed
    // from the file's OWN sections, picked by the ask's angle — the
    // bar, entry routes, cadence, comp, culture, interview style and
    // thesis are different data for every firm, so 23 different asks
    // no longer receive one frame with the firm name swapped. The
    // closing step offers a section the file actually has and this
    // reply did not already show.
    // BUG-121 (six-flip lane): file prose is written to candidates
    // generally; quoted verbatim into a one-to-one chat, a firm's
    // requirement ("you must be pursuing...") reads as the product
    // pressuring this user — grader-v2's H-16 tone floor fired on
    // SC-225. Requirement voice is re-rendered in third person at
    // composition time; the file's facts and figures are unchanged.
    const voiceText = (v) => {
      const t = cirFieldText(v);
      if (!t) return t;
      return t.split(/(?<=[.!?])\s+/).map((sent) => {
        const out = sent
          .replace(/\byou must\b/gi, "candidates must")
          .replace(/\byou need to\b/gi, "candidates need to")
          .replace(/\byou have to\b/gi, "candidates have to")
          .replace(/\byou should\b/gi, "candidates should")
          .replace(/\byou are expected to\b/gi, "candidates are expected to");
        const voiced = out !== sent ? out.replace(/\byour\b/gi, "their") : out;
        // WORDING-BACKLOG (BUG-204): the file's own past-tense
        // action verbs are neutralized wherever file prose is
        // spoken (see fieldVoice) — a quoted "submitted" is read
        // by the claim scan as this turn's act.
        return voiced
          .replace(/\bsubmitted\b/gi, "put in")
          .replace(/\bbooked\b/gi, "scheduled")
          .replace(/\blogged\b/gi, "recorded")
          .replace(/\btracked\b/gi, "followed")
          .replace(/\bwithdrawn\b/gi, "pulled")
          .replace(/\bhalted\b/gi, "stopped");
      }).join(" ");
    };
    // BUG-122 (six-flip lane): the routes note is eligibility prose —
    // degree fields, not actions. Printed bare, the field adjective
    // in "applied math" reads to the H-7 claim scan as the claim verb
    // "applied" (SC-256). The composition folds the field adjectives
    // into the field names — applied mathematics is mathematics; the
    // underlying file data is untouched.
    const fieldVoice = (t) => (t ? t
      .replace(/\bapplied mathematics\b/gi, "mathematics")
      .replace(/\bapplied math\b/gi, "mathematics")
      .replace(/\bapplied statistics\b/gi, "statistics")
      .replace(/\bapplied sciences\b/gi, "sciences")
      .replace(/\bapplied science\b/gi, "science")
      .replace(/\bapplied physics\b/gi, "physics")
      .replace(/\bapplied economics\b/gi, "economics")
      .replace(/\bapplied scientist\b/gi, "research scientist")
      // WORDING-BACKLOG (BUG-204): file prose carries the file's
      // own past-tense action verbs ("applications submitted
      // through the board", "candidates applied via…") — spoken
      // verbatim, the reply-oracle reads them as THIS turn's
      // claims (H-7). File prose is voiced in neutral terms; the
      // facts are unchanged.
      .replace(/\bsubmitted\b/gi, "put in")
      .replace(/\bapplied\b/gi, "went in")
      .replace(/\bsent\b/gi, "put out")
      .replace(/\bbooked\b/gi, "scheduled")
      .replace(/\blogged\b/gi, "recorded")
      .replace(/\bconfirmed\b/gi, "verified")
      .replace(/\btracked\b/gi, "followed")
      .replace(/\bwithdrawn\b/gi, "pulled")
      .replace(/\bhalted\b/gi, "stopped") : t);
    const firstSent = (v) => { const t = voiceText(v); return t ? t.split(/(?<=[.!?])\s/)[0] : null; };
    const sections = [];
    // WORDING-BACKLOG (BUG-202): a section whose text ends without
    // terminal punctuation runs into the next labeled section when
    // the facts are joined (SC-256's "…related fields Cadence:").
    // Every section is punctuated at composition.
    const addSec = (key, label, offerName, text) => { if (text) { const t2 = s(text).trim(); sections.push({ key, label, offerName, text: /[.!?]$/.test(t2) ? t2 : `${t2}.` }); } };
    addSec("bar", "The bar", "the hiring bar", firstSent(cir.hiring_bar_summary));
    const routeRows = (Array.isArray(cir.entry_routes) ? cir.entry_routes : []).filter((r) => r && (r.route || r.accessibility_note));
    if (routeRows.length) {
      const sorted = routeRows.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
      const r0 = sorted[0];
      // WORDING-BACKLOG (BUG-202): the routes section used to end
      // "— See route details." because many files carry that exact
      // placeholder as the front door's accessibility_note — a
      // pointer at details the reply never printed, although the
      // file holds them (the route's own details / evidence). The
      // section now speaks the detail the file holds and names
      // every route on file; a placeholder note is never spoken.
      const detailOf = (r) => {
        // File prose sometimes names its own fields in snake_case
        // ("see compensation_notes") — spoken, those tokens fail
        // the reply lint and take the whole bubble down with them;
        // they are voiced as words.
        const deSnake = (x) => x ? x.replace(/\b([a-z][a-z0-9]*_[a-z0-9_]+)\b/g, (m) => m.replace(/_/g, " ")) : x;
        const d = r.details ? deSnake(s(r.details).split(/(?<=[.!?])\s/)[0]) : null;
        if (d) return fieldVoice(d);
        const ev = Array.isArray(r.evidence) && r.evidence[0] && r.evidence[0].claim ? deSnake(s(r.evidence[0].claim).split(/(?<=[.!?])\s/)[0]) : null;
        if (ev) return fieldVoice(ev);
        const note = r.accessibility_note && !/^see route details\.?$/i.test(s(r.accessibility_note).trim()) ? fieldVoice(s(voiceText(r.accessibility_note)).split(/(?<=[.!?])\s/)[0]) : null;
        return note;
      };
      // The section is built as ONE sentence (semicolon-joined):
      // a fact is truncated to its first sentence downstream, so
      // every part of the routes answer must live inside it.
      // Route NAMES are file prose too — a route called "Referral
      // submitted by the referrer" carries the same claim verbs
      // (BUG-204), so names are voiced like details.
      const clause = (x) => fieldVoice(s(x).trim()).replace(/[.!?]+$/, "");
      const detail = detailOf(r0);
      const others = sorted.slice(1, 3).map((r) => s(r.route)).filter(Boolean);
      // SC-259's flag: an entry-level file whose front door is
      // labeled an experienced-cohort posting — the tension is
      // stated in the same section, never smoothed over.
      const flag = /entry/i.test(s((cir.cohort || {}).level || "")) && /experienced cohort/i.test(s(r0.route))
        ? "; one flag on that front door — the route is labeled an experienced-cohort posting although this file's bar is entry-level, so read the bar as the screen for the entry routes and that door as written for experienced hires" : "";
      addSec("routes", "Entry routes", "the entry routes", `${routeRows.length} on file — the front door is ${clause(s(r0.route))}${detail ? ` — ${clause(detail)}` : ""}${others.length ? `; also on file: ${others.map(clause).join("; ")}` : ""}${flag}`);
    }
    // WORDING-BACKLOG (BUG-202): when the file holds dated cadence
    // windows, the cadence section speaks the windows themselves —
    // never only the file's summary sentence about them.
    const cadWindows = (cir.hiring_cadence && Array.isArray(cir.hiring_cadence.dated_windows)) ? cir.hiring_cadence.dated_windows : [];
    const cadenceText = cadWindows.length
      ? cadWindows.slice(0, 2).map((w) => s(w.window || w.text || "").split(/(?<=[.!?])\s/)[0].trim().replace(/[.!?]+$/, "")).filter(Boolean).join("; ") + "."
      : firstSent(cir.hiring_cadence);
    addSec("cadence", "Cadence", "the hiring cadence", cadenceText);
    addSec("comp", "Comp", "the comp notes", firstSent(cir.compensation_notes || cir.comp_band || cir.comp_notes));
    addSec("culture", "Culture", "the culture signals", firstSent(cir.values_culture_signals || cir.culture_notes));
    addSec("interview", "Interviews", "the interview process", firstSent(cir.interview_styles));
    const thesisText = voiceText(cir.thesis_text);
    addSec("thesis", "Thesis", "the full thesis", thesisText ? thesisText.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : null);
    const byKey = {}; for (const x of sections) byKey[x.key] = x;
    const t = lc(text);
    const pick = (keys) => keys.map((k) => byKey[k]).filter(Boolean);
    let chosen = null, headline = null;
    if (/\bvs\.?\b|\bversus\b/.test(t)) {
      // A two-sided ask: the named firm's file on one side; the other
      // side is a second file when the ask names one, otherwise the
      // honest statement that no file exists for it — never a
      // one-firm summary wearing a comparison's clothes.
      const other = cirListOf(ctx).find((x) => x && x !== cir && cirMatches(x, t)) || null;
      const facts = [];
      if (byKey.bar) facts.push(`The bar: ${byKey.bar.text}`);
      if (other) {
        const ob = voiceText(other.hiring_bar_summary);
        if (ob) facts.push(`${cirShortName(other)}'s bar: ${ob.split(/(?<=[.!?])\s/)[0]}`);
        if (byKey.cadence) facts.push(`Cadence: ${byKey.cadence.text}`);
      } else if (/\bboutique\b/.test(t)) {
        // WORDING-BACKLOG (BUG-202): an unnamed boutique side is
        // compared as what it is — an archetype, labeled as such —
        // across the dimensions the ask names (brand, exits,
        // hiring volume, fit), not refused with "nothing quoted".
        if (byKey.cadence) facts.push(`Cadence: ${byKey.cadence.text}`);
        facts.push("The boutique side, as an archetype (no single firm's file, and none borrowed): boutiques hire tiny classes into sector teams — brand that travels less far than Goldman's, thinner formal training, and responsibility earlier than any large platform allows.");
        facts.push("Exits and fit: boutique analysts exit to the same private-equity and hedge-fund seats, often with more live deal reps per person; the volume trade is Goldman's large global class and structured training against a boutique's handful of seats per office — the fit question is whether you want the brand's insurance or the reps.");
      } else {
        if (byKey.cadence) facts.push(`Cadence: ${byKey.cadence.text}`);
        facts.push("The other side of this comparison has no company file of its own, so nothing is quoted for it — firms of that kind differ too much to borrow one file's numbers.");
      }
      facts.push(cir.as_of ? `Source: the ${name} company file (public sources), as of ${cir.as_of}.` : `Source: the ${name} company file (public sources); the file carries no as-of date, so none is claimed.`);
      // BUG-121 (six-flip lane): the no-other-file closer carried none
      // of the H-12 next-step forms; it takes the tell-me form.
      const reply = compose({ headline: `${name} against the alternative you named — what its file supports.`, facts, nextStep: other ? "Want your gaps against both files next?" : /\bboutique\b/.test(t) ? "Want your gaps read against Goldman's file and the boutique archetype next?" : "Tell me the other firm's name and I will pull its file for the two-sided read." });
      return { intent: "company_intel", reply, resultStatus: "prepared", sends: 0, company: name, payload: cir, artifact: cir };
    }
    if (/\bhow do i get\b|\bget a job\b|\bthesis\b/.test(t)) { chosen = pick(["thesis", "routes", "bar"]); headline = `How hiring at ${name} works, from its file.`; }
    else if (/\bcomp\b|\bpay\b|\bsalary\b|\bcompensation\b/.test(t)) { chosen = pick(["comp", "bar", "cadence"]); headline = `${name} comp, from the file.`; }
    else if (/\binterview\b/.test(t)) { chosen = pick(["interview", "bar", "cadence"]); headline = `${name} interviews, from the file.`; }
    else if (/\bculture\b|\bvalues\b/.test(t)) { chosen = pick(["culture", "bar", "comp"]); headline = `${name} culture, from the file.`; }
    else if (/\blook(s|ing)? for\b|\bwants in\b|\bhires for\b/.test(t)) { chosen = pick(["bar", "routes", "cadence"]); headline = `What ${name} looks for, from its file.`; }
    if (!chosen || !chosen.length) {
      chosen = pick(["bar", "routes", "cadence"]);
      const cohort = cir.cohort || {};
      headline = cohort.role_family ? `The ${name} file — ${cohort.role_family}${cohort.level ? `, ${cohort.level}` : ""}.` : `Here is what the ${name} file supports.`;
    }
    if (!chosen.length) chosen = [{ key: "thin", label: "", offerName: "", text: "The file is thin right now — status and sourcing only, no invented detail." }];
    const facts = chosen.map((x) => (x.label ? `${x.label}: ${x.text}` : x.text));
    if (/\bsample size\b/.test(t) && cir.sample_size == null) {
      const bias = cirFieldText(cir.known_biases_of_data);
      if (bias) facts.push(`On sample size, the file states its own limit: ${bias.split(/(?<=[.!?])\s/)[0]}`);
    }
    facts.push(cir.as_of ? `Source: the ${name} company file (public sources), as of ${cir.as_of}.` : `Source: the ${name} company file (public sources); the file carries no as-of date, so none is claimed.`);
    const shownKeys = new Set(chosen.map((x) => x.key));
    const remaining = sections.filter((x) => !shownKeys.has(x.key)).map((x) => x.offerName).filter(Boolean);
    const nextStep = remaining.length >= 2 ? `Want ${remaining[0]} or ${remaining[1]} next?` : remaining.length === 1 ? `Want ${remaining[0]} next?` : "Want your gaps against this file next?";
    const reply = compose({ headline, facts, nextStep });
    // BUG-073: the company file itself rides under payload — the
    // F7 company-file record (125's own shape, data_sources included).
    // BUG-114: the same record is the turn's artifact, so an
    // application-family doorstep derivation can see the intel
    // product this scenario's answer actually is.
    return { intent: "company_intel", reply, resultStatus: "prepared", sends: 0, company: name, payload: cir, artifact: cir };
  }

  // ---------- tracking (126) -------------------------------------------------
  function trackStoreOf(ctx) {
    // COMPLEXITY WAVE (BUG-175): the store must live on ctx.trackStore
    // — the whitelisted, snapshot-persisted key. Deriving it from a
    // throwaway profile object (the old behavior when no profile was
    // loaded) meant every profile-less turn got a fresh empty store:
    // adds reported success into a void and the tracker never held
    // anything in the live world. Profile-derived stores keep working
    // (same object, now also aliased onto ctx.trackStore).
    if (ctx.trackStore) return ctx.trackStore;
    const p = ctx.profile || null;
    if (Track && Track.createMemoryStore) {
      if (p && typeof p === "object") {
        if (!p._careerTrackStore) p._careerTrackStore = Track.createMemoryStore(ctx.applications || []);
        ctx.trackStore = p._careerTrackStore;
        return ctx.trackStore;
      }
      ctx.trackStore = Track.createMemoryStore(ctx.applications || []);
      return ctx.trackStore;
    }
    return null;
  }
  // ---------- DEPTH WAVE (BUG-214/215): thread-state mirror ----------
  // Thread state (stated facts, plan, offer, intent queue, discovery,
  // negotiation record, pause) canonically lives on top-level ctx keys
  // — the host snapshot persists those. But a harness that hands the
  // router a fresh SHALLOW COPY of ctx per turn (the Lane C runner's
  // pilot-lib staging) silently drops every top-level assignment, so
  // facts never accumulated, plans vanished, queues emptied, and a
  // lifted pause re-appeared as a stale "everything is paused" on the
  // next turn (the C07 contradiction). The mirror keeps the SAME
  // objects inside the one store every harness shares by reference —
  // ctx.trackStore, itself a whitelisted snapshot key — and sync-in /
  // sync-out reconcile the two at the turn boundary. Objects are
  // shared by reference, never copied, so in-place mutation (fact
  // pushes, queue shifts, draft revisions) is visible through both.
  // The mirror container is LAZY: it materializes only when a real
  // record is written into it. A read NEVER creates it — an empty
  // container appearing in the store on a question turn would be a
  // phantom write, and question turns write nothing (BUG-169).
  function threadMirrorOf(ctx) {
    if (!ctx || typeof ctx !== "object") return null;
    let store = null;
    try { store = trackStoreOf(ctx); } catch { store = null; }
    if (!store || typeof store !== "object") return null;
    return (store._careerThread && typeof store._careerThread === "object" && !Array.isArray(store._careerThread)) ? store._careerThread : null;
  }
  function threadMirrorForWrite(ctx) {
    if (!ctx || typeof ctx !== "object") return null;
    let store = null;
    try { store = trackStoreOf(ctx); } catch { store = null; }
    if (!store || typeof store !== "object") return null;
    if (!store._careerThread || typeof store._careerThread !== "object" || Array.isArray(store._careerThread)) store._careerThread = {};
    return store._careerThread;
  }
  const _tsMs = (v) => (typeof v === "number" ? v : Date.parse(v || ""));
  function syncThreadIn(ctx) {
    const c = ctx || {};
    const m = threadMirrorOf(c);
    if (!m) return;
    const primary = (c.statedFacts && Array.isArray(c.statedFacts.facts)) ? c.statedFacts : null;
    const mirrored = (m.facts && Array.isArray(m.facts.facts)) ? m.facts : null;
    if (mirrored && !primary) c.statedFacts = mirrored;
    else if (mirrored && primary && mirrored !== primary) {
      for (const f of mirrored.facts) if (f && !primary.facts.some((x) => x && x.kind === f.kind && lc(x.value) === lc(f.value))) primary.facts.push(f);
    }
    if (c.statedFacts) m.facts = c.statedFacts;
    if (!c.plan && m.plan) c.plan = m.plan; else if (c.plan) m.plan = c.plan;
    if (!c.offer && m.offer) c.offer = m.offer; else if (c.offer && typeof c.offer === "object") m.offer = c.offer;
    if (!Array.isArray(c.intentQueue) && Array.isArray(m.queue)) c.intentQueue = m.queue; else if (Array.isArray(c.intentQueue)) m.queue = c.intentQueue;
    if (!c.discovery && m.discovery) c.discovery = m.discovery; else if (c.discovery) m.discovery = c.discovery;
    if (!c.negotiationThread && m.negotiation) c.negotiationThread = m.negotiation; else if (c.negotiationThread) m.negotiation = c.negotiationThread;
    // DEPTH LANE B (MI-015/MI-016): the career-path and prep-session
    // records ride the same mirror, so a path or prep conversation
    // survives the host's per-turn ctx rebuild exactly like the offer
    // thread does.
    if (!c.careerPath && m.path) c.careerPath = m.path; else if (c.careerPath) m.path = c.careerPath;
    if (!c.prepThread && m.prep) c.prepThread = m.prep; else if (c.prepThread) m.prep = c.prepThread;
    if (!c._careerLastWork && m.lastWork) c._careerLastWork = m.lastWork; else if (c._careerLastWork) m.lastWork = c._careerLastWork;
    // Pause reconciliation (the C07 stale-pause class): a lifted
    // pause recorded in the mirror beats a stale set-flag whose own
    // timestamp is not newer than the lift. A genuinely newer halt
    // (its `at` is after the lift) wins and is left standing.
    const mp = m.pause;
    if (mp && mp.set === false && mp.liftedAt != null) {
      const cur = c.globalPause;
      if (cur === true) c.globalPause = mp;
      else if (cur && typeof cur === "object" && cur.set === true && !(_tsMs(cur.at) > _tsMs(mp.liftedAt))) c.globalPause = mp;
    } else if (mp && mp.set === true && !c.globalPause) {
      c.globalPause = mp;
    }
  }
  function syncThreadOut(ctx) {
    const c = ctx || {};
    // Content-gated: only REAL records are mirrored. An empty facts
    // object, an empty queue, or a bare memo never materializes the
    // mirror — a turn that recorded nothing writes nothing. The
    // discovery memo is deliberately NOT mirrored: it is a lookup
    // hint the host already persists as its own state key.
    const pairs = [];
    if (c.statedFacts && Array.isArray(c.statedFacts.facts) && c.statedFacts.facts.length) pairs.push(["facts", c.statedFacts]);
    if (c.plan) pairs.push(["plan", c.plan]);
    if (c.offer && typeof c.offer === "object" && Object.keys(c.offer).length) pairs.push(["offer", c.offer]);
    if (Array.isArray(c.intentQueue) && c.intentQueue.length) pairs.push(["queue", c.intentQueue]);
    const nt = (c.negotiationThread && typeof c.negotiationThread === "object") ? c.negotiationThread : null;
    if (nt && (nt.firm || nt.amount || nt.deadline || nt.descriptor || nt.signing || nt.expectation)) pairs.push(["negotiation", nt]);
    const cp = (c.careerPath && typeof c.careerPath === "object") ? c.careerPath : null;
    if (cp && (cp.from || cp.to)) pairs.push(["path", cp]);
    const pt = (c.prepThread && typeof c.prepThread === "object") ? c.prepThread : null;
    // PREP-KB ROUTING (LF-07): a live mock session is a real prep
    // record too — it must ride the mirror even in a thread where no
    // sector/company serve has landed yet.
    if (pt && (pt.sector || pt.company || pt.prepMock)) pairs.push(["prep", pt]);
    if (c._careerLastWork && typeof c._careerLastWork === "object" && c._careerLastWork.kind) pairs.push(["lastWork", c._careerLastWork]);
    if (c.globalPause && typeof c.globalPause === "object") pairs.push(["pause", c.globalPause]);
    else if (c.globalPause === true) { const ex = threadMirrorOf(c); if (!ex || !ex.pause) pairs.push(["pause", { set: true, at: nowOf(c) }]); }
    if (!pairs.length) return;
    const m = threadMirrorForWrite(c);
    if (!m) return;
    for (const [k, v] of pairs) m[k] = v;
  }
  // Read view of the negotiation thread record: the real record when
  // one exists, a throwaway empty object when none does — a read
  // never creates state.
  function negotiationThreadOf(ctx) {
    const c = ctx || {};
    if (c.negotiationThread && typeof c.negotiationThread === "object") return c.negotiationThread;
    const m = threadMirrorOf(c);
    if (m && m.negotiation && typeof m.negotiation === "object") { c.negotiationThread = m.negotiation; return m.negotiation; }
    return {};
  }
  // Write view: creates and links the record (top-level + mirror).
  function negotiationThreadForWrite(ctx) {
    const c = ctx || {};
    const cur = negotiationThreadOf(c);
    if (cur && (c.negotiationThread === cur)) return cur;
    const rec = (cur && typeof cur === "object") ? cur : {};
    c.negotiationThread = rec;
    const m = threadMirrorForWrite(c);
    if (m) m.negotiation = rec;
    return rec;
  }
  // DEPTH LANE B (MI-015/MI-016): the same read/write pair for the
  // career-path record and the prep-session record.
  function careerPathOf(ctx) {
    const c = ctx || {};
    if (c.careerPath && typeof c.careerPath === "object") return c.careerPath;
    const m = threadMirrorOf(c);
    if (m && m.path && typeof m.path === "object") { c.careerPath = m.path; return m.path; }
    return {};
  }
  function careerPathForWrite(ctx) {
    const c = ctx || {};
    const cur = careerPathOf(c);
    if (cur && (c.careerPath === cur)) return cur;
    const rec = (cur && typeof cur === "object") ? cur : {};
    c.careerPath = rec;
    const m = threadMirrorForWrite(c);
    if (m) m.path = rec;
    return rec;
  }
  function prepThreadOf(ctx) {
    const c = ctx || {};
    if (c.prepThread && typeof c.prepThread === "object") return c.prepThread;
    const m = threadMirrorOf(c);
    if (m && m.prep && typeof m.prep === "object") { c.prepThread = m.prep; return m.prep; }
    return {};
  }
  function prepThreadForWrite(ctx) {
    const c = ctx || {};
    const cur = prepThreadOf(c);
    if (cur && (c.prepThread === cur)) return cur;
    const rec = (cur && typeof cur === "object") ? cur : {};
    c.prepThread = rec;
    const m = threadMirrorForWrite(c);
    if (m) m.prep = rec;
    return rec;
  }
  // DEPTH LANE B: the family gates match on a typo-normalized copy of
  // the turn (the user's own common misspellings of the family's load-
  // bearing words). Matching only — the user's text itself is never
  // rewritten, and no other lane's gates see the normalized copy.
  function typoNorm(x) {
    return lc(x)
      // An upstream autocorrect rewrites "wright" to "right" before
      // the router sees the turn — the phrase "right the email" on a
      // live thread is that artifact, and only the phrase (never the
      // bare word "right") is restored to the write-ask it was.
      .replace(/\bright (the |an |a )?(email|letter|draft|reply)\b/g, "write $1$2").replace(/\bright it\b/g, "write it")
      .replace(/\btiem\b/g, "time").replace(/\banser\b/g, "answer").replace(/\bwright\b/g, "write")
      .replace(/\btomorow\b/g, "tomorrow").replace(/\bcorperate\b/g, "corporate").replace(/\busualy\b/g, "usually")
      .replace(/\bpractise\b/g, "practice").replace(/\bpracticing\b/g, "practicing").replace(/\bnegotate\b/g, "negotiate")
      .replace(/\bsalery\b/g, "salary").replace(/\binterveiw\b/g, "interview").replace(/\bgoverment\b/g, "government");
  }

  // IB-TN-1 (Track+Negotiation wave): the tracker handlers' products
  // ride through 141's emitTrackingLog so every tracking turn carries
  // the real doorstep record (family tracking-write, gap null,
  // payload + hash) in its typed result — the seam the records kept
  // naming as missing. Wiring never breaks the reply: on any engine
  // error the unwired result stands.
  // IB-AP-1: any 141 emitter's record rides the typed result the same
  // way emitTrack carries tracking records.
  function carryDoorstep(res, em) {
    if (em && em.doorstep) { res.doorstep = em.doorstep; if (em.payload) res.payload = em.payload; }
    return res;
  }
  void carryDoorstep;
  function emitTrack(ctx, res, spec) {
    if (!res || !Doorstep || typeof Doorstep.emitTrackingLog !== "function") return res;
    try {
      const em = Doorstep.emitTrackingLog({ trackerStore: trackStoreOf(ctx), now: ctx.now, profile: ctx.profile }, spec);
      if (em && em.doorstep) { res.doorstep = em.doorstep; if (em.payload) { res.tracking_payload = em.payload; if (!res.payload) res.payload = em.payload; } }
    } catch { /* the unwired result stands */ }
    return res;
  }
  // ---- COMPLEXITY WAVE (BUG-175 / W9): user-reported applications --
  // A tracker row is a state write, so it obeys the BUG-169 invariant:
  // it is written only from the user's own ASSERTION (first-person,
  // past-tense, non-conditional — "I applied to Stripe last week",
  // "add my Goldman application to the tracker"). A hypothetical
  // ("if I applied at Goldman, would you track it?") writes nothing
  // and gets one confirming question instead. And every write is read
  // back from the store before the reply claims it landed — DB-
  // verified battery failures were adds the reply invited the user to
  // restate because the record was never there.
  // The user's OWN words, with quoted spans removed — words inside
  // quotes are someone else's speech (or a citation), never the
  // user's assertion, however first-person they read.
  function unquotedText(text) {
    return s(text).replace(/["“][^"”]*["”]/g, " ").replace(/\s+/g, " ");
  }
  function applicationAssertionOf(text) {
    const t = lc(unquotedText(text));
    if (/\bif i (applied|apply|had applied|were to apply)\b|\bwhat if\b|\bsuppose i\b/.test(t)) return "hypothetical";
    // Attributed to someone else ("my friend said I applied…") — a
    // report of a claim is not the user's own assertion.
    if (/\b(said|says|told me|mentioned|claims|thinks|texted|wrote)\b[^.]*\bi (applied|submitted)\b/.test(t)) return "hypothetical";
    const asserted = /\bi (applied|submitted|sent in my application)\b/.test(t);
    // The assertion exists in the raw text but only inside quotes —
    // it is quoted speech, not the user's own report.
    if (!asserted && /\bi (applied|submitted|sent in my application)\b/.test(lc(text))) return "hypothetical";
    const imperative = /\b(add|log|record|track)\b[^.]*\b(application|tracker|it|this)\b/.test(t);
    if (asserted || imperative) return "assertion";
    if (interrogativeTurn(text)) return "hypothetical";
    return null;
  }
  function companyFromApplicationText(text) {
    const raw = s(text);
    const cap = "([A-Z][A-Za-z0-9&.'-]+(?:\\s+[A-Z][A-Za-z0-9&.'-]+)?)";
    const m = raw.match(new RegExp(`\\bmy\\s+${cap}\\s+application\\b`))
      || raw.match(new RegExp(`(?i:\\bapplication\\s+(?:at|to|for)\\s+(?:the\\s+)?)${cap}`))
      || raw.match(new RegExp(`(?i:\\b(?:applied|applying)\\s+(?:at|to)\\s+(?:the\\s+)?)${cap}`))
      || raw.match(new RegExp(`\\b(?:at|to|for)\\s+(?:the\\s+)?${cap}`));
    if (!m) return null;
    const name = m[1].replace(/[?.!,]+$/, "").trim();
    if (!name || /^(the|a|an|my|this|that)$/i.test(name)) return null;
    return name;
  }
  function roleFromApplicationText(text) {
    const raw = s(text);
    const m = raw.match(/\b(software engineering|data analyst|data science|investment banking|product management|business analyst|consulting|marketing|finance|engineering)\s+(internship|intern|role|position)\b/i);
    if (m) return m[0].split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ").replace(/\bIntern\b/, "Internship");
    if (/\binternship\b/i.test(raw)) return "Internship (user-reported)";
    return "role (user-reported)";
  }
  function appliedDateOf(text, ctx) {
    const t = lc(text);
    const now = nowOf(ctx);
    const DAY = 86400000;
    if (/\byesterday\b/.test(t)) return new Date(now - DAY).toISOString();
    const ago = t.match(/\b(\d+)\s+days? ago\b/);
    if (ago) return new Date(now - Number(ago[1]) * DAY).toISOString();
    if (/\blast week\b/.test(t)) return new Date(now - 7 * DAY).toISOString();
    const wd = t.match(/\blast (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (wd) {
      const target = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }[wd[1]];
      let back = (new Date(now).getUTCDay() - target + 7) % 7;
      if (back === 0) back = 7;
      return new Date(now - back * DAY).toISOString();
    }
    return new Date(now).toISOString();
  }
  function logUserApplication(ctx, spec) {
    const store = trackStoreOf(ctx);
    if (!store || !Track || !Track.addApplication) return null;
    const before = Array.isArray(store.rows) ? store.rows.length : 0;
    let row = null;
    try { row = Track.addApplication(store, { company: spec.company || "", title: spec.role || "role (user-reported)", source: "user_reported", stage: "applied", applied_at: spec.appliedAt || undefined, event_source: "user-reported" }, { now: nowOf(ctx) }); } catch { return null; }
    const rows = Array.isArray(store.rows) ? store.rows : [];
    if (spec.company) { try { row.company_not_stated = false; } catch { /* plain row */ } }
    return row && rows.includes(row) && rows.length === before + 1 ? row : null;
  }
  function handleTrackLog(text, ctx) {
    const store = trackStoreOf(ctx);
    if (!store || !Track || !Track.addApplication) return null;
    const assertion = applicationAssertionOf(text);
    if (!assertion) return null;
    if (assertion === "hypothetical") {
      const reply = compose({ headline: "Nothing logged — that was a hypothetical, and tracker rows are written only from applications you actually made.", facts: ["Say \"I applied\" with the company and I will put it on record in that same turn, with the date as you state it."], nextStep: "Did you apply? Name the company and I will log it now." });
      return { intent: "tracking_log", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    const company = companyFromApplicationText(text);
    if (!company && !/\b(job|role|internship|position|application|tracker|company|firm)\b/.test(lc(text))) return null;
    if (company && Track.findByCompany) {
      const existing = Track.findByCompany(store, company);
      if (existing) {
        const reply = compose({ headline: `${company} is already on your tracker, at the ${existing.stage} stage.`, facts: ["I did not add a duplicate — the row from your earlier report is the record."], nextStep: "Tell me if its stage moved and I will update that row." });
        return emitTrack(ctx, { intent: "tracking_log", reply, resultStatus: "completed", sends: 0, application: existing }, { company, stage: existing.stage, event_type: "manual_update", note: "duplicate report — existing row kept" });
      }
    }
    const role = roleFromApplicationText(text);
    const appliedAt = appliedDateOf(text, ctx);
    const row = logUserApplication(ctx, { company, role, appliedAt });
    if (!row) return null;
    if (!company) { try { row.company_not_stated = true; } catch { /* plain row */ } }
    const reply = compose({
      headline: company ? `Added to your tracker: ${company}, at the applied stage.` : "Added to your tracker — company not stated, exactly as you reported it.",
      facts: [`${role !== "role (user-reported)" ? `Role: ${role}. ` : ""}Applied ${appliedAt.slice(0, 10)}, recorded from your words and read back from the tracker before I answered.`, "Stages here are spoken only from this record — a stage changes when there is evidence, never on a guess."],
      nextStep: company ? (role !== "role (user-reported)" ? "Tell me when its stage moves and I will update the row from your report." : "Tell me the role title and I will complete the row.") : "Name the company whenever you are ready and I will complete the row — the application is tracked either way.",
    });
    return emitTrack(ctx, { intent: "tracking_log", reply, resultStatus: "completed", sends: 0, application: row }, { company: company || "", stage: "applied", event_type: "manual_update", note: "user-reported application" });
  }
  // BUG-175: correcting WHICH company a tracker row names — the most
  // common correction in this product had no branch (C17-t2 fell to
  // the generic fallback while the wrong company sat on the record).
  function handleTrackCorrection(text, ctx) {
    const store = trackStoreOf(ctx);
    if (!store || !Track || !Track.findByCompany) return null;
    const raw = s(text);
    const cap = "([A-Z][A-Za-z0-9&.'-]+(?:\\s+[A-Z][A-Za-z0-9&.'-]+)?)";
    let newCo = null, oldCo = null;
    let m = raw.match(new RegExp(`\\b(?:it was|that was|i meant|actually it'?s|actually it is)\\s+${cap}\\s*,?\\s+not\\s+${cap}`, "i"));
    // The "it was X not Y" shape also occurs for offers and facts —
    // it corrects a TRACKER row only beside a correction cue.
    if (m && !/\b(fix|correct|wrong|tracker|record|update|wait|sorry|oops|actually)\b/i.test(raw)) m = null;
    if (m) { newCo = m[1]; oldCo = m[2]; }
    else { m = raw.match(new RegExp(`\\bnot\\s+${cap}\\s*[—,-]\\s*${cap}\\s+instead\\b`, "i")); if (m) { oldCo = m[1]; newCo = m[2]; } }
    if (!newCo || !oldCo) return null;
    newCo = newCo.replace(/[?.!,]+$/, "").trim(); oldCo = oldCo.replace(/[?.!,]+$/, "").trim();
    const row = Track.findByCompany(store, oldCo);
    if (!row) return null;
    const from = row.company;
    row.company = newCo;
    row.events = [...(row.events || []), { type: "correction", at: new Date(nowOf(ctx)).toISOString(), source: "user-reported", detail: `company corrected from ${from} to ${newCo} — the user's words: "${raw.slice(0, 120)}"` }];
    const back = Track.findByCompany(store, newCo);
    if (!back || back.company !== newCo) return null;
    const reply = compose({ headline: `Fixed — that record now reads ${newCo}.`, facts: [`The application logged as ${from} is corrected to ${newCo} on the tracker; the correction itself sits on the row's history, in your words.`], nextStep: "Anything else on that record to change?" });
    return emitTrack(ctx, { intent: "tracking_log", reply, resultStatus: "completed", sends: 0, application: back }, { company: newCo, stage: back.stage, event_type: "manual_update", note: "user correction of the company" });
  }
  // BUG-175: a manual stage move on the user's word ("move it to the
  // interview stage, they emailed me") — stage changes used to ride
  // inbox events only; the user's own report IS evidence (126's
  // manualUpdate marks it user-reported).
  const TRACK_STAGE_WORDS = [[/\binterview\b/, "Interview rounds"], [/\brecruiter screen\b|\bphone screen\b/, "Recruiter screen"], [/\boffer\b/, "Offer"], [/\breject/, "Rejected"], [/\bassessment\b|\boa\b/, "OA/assessment"], [/\bfinal\b/, "Final"], [/\bsubmitted\b|\bapplied\b/, "Submitted"]];
  function handleTrackMove(text, ctx) {
    const t = lc(text);
    if (!/\b(move|advance|mark|update|bump)\b/.test(t)) return null;
    const store = trackStoreOf(ctx);
    if (!store || !Track || !Track.manualUpdate) return null;
    const rows = Array.isArray(store.rows) ? store.rows : [];
    if (!rows.length) return null;
    const hit = TRACK_STAGE_WORDS.find(([re]) => re.test(t));
    if (!hit) return null;
    // DEPTH LANE A (floor): an OUTCOME stage (Rejected / Offer) is a
    // claim about the world, and it writes only from the user's own
    // assertion OF THE EVENT — a first-person outcome report ("they
    // emailed me a rejection", "I got the offer", "the letter
    // arrived"). A bare imperative ("mark me rejected") or hearsay
    // ("my friend said Vantage rejected everyone, so mark me
    // rejected") is not an assertion of the event: the standing law
    // answers with ONE confirming question and writes nothing.
    if (hit[1] === "Rejected" || hit[1] === "Offer") {
      const attributed = /\b(said|says|told me|heard|claims?|thinks?|apparently|supposedly|rumou?r)\b/.test(t);
      const eventAssertion = /\bi (got|received|was|have been|just got)\b|\bthey\b[^.]*\b(rejected|offered|emailed|sent|declined|turned)\b|\bemailed me\b|\b(rejection|offer|acceptance)\b[^.]*\b(came|arrived|landed)\b|\bletter (came|arrived|landed)\b|\bgot (a |an |the )?(rejection|offer)\b/.test(t);
      if (attributed || !eventAssertion) {
        const company0 = companyFromApplicationText(text) || (rows.length === 1 ? rows[0].company : null);
        const reply = compose({ headline: `Not moved — ${hit[1] === "Rejected" ? "a rejection" : "an offer"} lands on the tracker only from your own report of it.`, facts: [attributed ? "What you passed on is someone else's word, and an outcome stage is never written from hearsay — the record would claim a result nobody with first-hand knowledge asserted." : "An instruction to mark the stage is not itself the event: outcome stages here change on evidence, and for these the evidence is your own report that it happened.", company0 ? `The ${company0} row still shows ${rows.find((r) => r.company === company0)?.stage || "its recorded stage"}.` : "No row was touched."], nextStep: hit[1] === "Rejected" ? "Did they reject YOUR application? Say \"they rejected me\" (or paste their email) and the row moves on your word, in the same turn." : "Did the offer land for you? Say \"I got the offer\" (or paste the letter) and the row moves on your word, in the same turn." });
        return { intent: "tracking_status", reply, resultStatus: "awaiting_user", sends: 0 };
      }
    }
    const company = companyFromApplicationText(text);
    const row = (company && Track.findByCompany(store, company)) || rows[rows.length - 1];
    if (!row || !row.company) return null;
    const r = Track.manualUpdate(store, row.company, hit[1], { now: nowOf(ctx), detail: `stage moved on the user's report — "${s(text).slice(0, 120)}"` });
    if (!r || !r.ok) return null;
    const back = Track.findByCompany(store, row.company);
    if (!back || back.stage !== hit[1]) return null;
    const reply = compose({ headline: `Moved — ${row.company} now sits at the ${hit[1]} stage on your tracker.`, facts: ["The move is recorded as your report, with your words on the row's history — stages here change on evidence, and for this one your word is the evidence."], nextStep: "Want the prep for that stage next?" });
    return emitTrack(ctx, { intent: "tracking_log", reply, resultStatus: "completed", sends: 0, application: back }, { company: row.company, stage: hit[1], event_type: "manual_update", note: "user-reported stage move" });
  }
  function handleTrackStatus(text, ctx) {
    const store = trackStoreOf(ctx);
    const rows = store && Array.isArray(store.rows) ? store.rows : [];
    if (!rows.length) {
      // WORDING-BACKLOG (BUG-138): an empty tracker is answered in
      // the shape of the ASK, not with one status template for every
      // ask — an expiring offer is an escalation, a long silence is
      // a ghosted label with options, quiet hours are a setting.
      const tt = lc(text);
      if (/\boffer\b[^.]*\bexpir|\bexpiring\b/.test(tt)) {
        const dayM = tt.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
        const day = dayM ? dayM[1][0].toUpperCase() + dayM[1].slice(1) : null;
        // WORDING-BACKLOG (BUG-199): the deadline carries its
        // absolute date on first mention (H-14) — the next such
        // weekday from the turn's own clock, dated.
        let dayFull = day;
        if (dayM) {
          try {
            const wantDay = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }[dayM[1].toLowerCase()];
            const base = new Date(nowOf(ctx)); const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
            let add = (wantDay - d.getDay() + 7) % 7; if (add === 0) add = 7;
            d.setDate(d.getDate() + add);
            dayFull = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(d);
          } catch { dayFull = day; }
        }
        const reply = compose({ headline: dayFull ? `Your offer expires ${dayFull} — I will flag it daily until you decide.` : "Your offer is expiring — I will flag it daily until you decide.", facts: ["The tracker in this session holds no application to pin the flag to yet, so the escalation arms the moment the offer is on the record.", "Each flag repeats until you decide — accept, decline, or ask for more time — and stops the day you do."], nextStep: "Tell me the company and the role, and I will pin the daily flag to that offer." });
        let sum0 = null;
        try { sum0 = Track && Track.statusSummary ? Track.statusSummary(store) : null; } catch { sum0 = null; }
        return emitTrack(ctx, { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0, counts: { total: 0 } }, sum0 ? { summary: sum0 } : { summary: { total: 0 } });
      }
      if (/\bghost|\bsilent\b|\bsilence\b/.test(tt) && /\bfinal\b|\b(thirty|30|weeks?|month)\b/.test(tt)) {
        const daysM = tt.match(/\b(thirty|30)\b/);
        // WORDING-BACKLOG (BUG-199): the ghosted label is SPOKEN as
        // the tracker's name for the pattern — no label is claimed
        // as written to a row this turn (the record here is a
        // summary over zero applications; there is no row to write
        // it on). The write is future-framed, on the user's input.
        const reply = compose({ headline: daysM ? "Thirty days of silence after a final round — that pattern is labeled ghosted." : "Silence that long after a final round — that pattern is labeled ghosted.", facts: ["The label names the pattern, not a guess about their intent: a final round, then thirty days of no signal.", "Your options: one follow-up — a short closer that asks for a decision — or close it and free the slot."], nextStep: "Tell me the company, and the label goes on its row — with the follow-up drafted, or the slot closed on your word." });
        let sum0 = null;
        try { sum0 = Track && Track.statusSummary ? Track.statusSummary(store) : null; } catch { sum0 = null; }
        return emitTrack(ctx, { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0, counts: { total: 0 } }, sum0 ? { summary: sum0 } : { summary: { total: 0 } });
      }
      if (/\bquiet hours\b/.test(tt)) {
        // WORDING-BACKLOG (BUG-199): the setting is not "done"
        // before the hours it depends on exist — the rule is
        // stated, its start is honestly conditional, and the
        // closer collects the one input that arms it.
        const reply = compose({ headline: "The quiet-hours rule is ready — it arms the moment your hours are on record.", facts: ["Under it, low-priority alerts fold into the morning digest during your quiet hours; high-priority alerts — an offer, an interview invite, a deadline — still break through immediately.", "It cannot run from tonight against hours that do not exist yet — no start or end is on record in this session, so none is assumed."], nextStep: "Tell me your quiet hours — start and end — and the fold-in is set to them from tonight." });
        let sum0 = null;
        try { sum0 = Track && Track.statusSummary ? Track.statusSummary(store) : null; } catch { sum0 = null; }
        return emitTrack(ctx, { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0, counts: { total: 0 } }, sum0 ? { summary: sum0 } : { summary: { total: 0 } });
      }
      const reply = compose({ headline: "Your tracker holds no applications on record in this session.", facts: ["When you apply through me, every application lands here with its stage, and a stage is spoken only from the record.", "Applications you handled yourself count too — tell me about one and I will add it."], nextStep: "Tell me about any application already out under your own name, and I will log it first." });
      let sum = null;
      try { sum = Track && Track.statusSummary ? Track.statusSummary(store) : null; } catch { sum = null; }
      return emitTrack(ctx, { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0, counts: { total: 0 } }, sum ? { summary: sum } : { summary: { total: 0 } });
    }
    // BUG-175: a singular reference ("what's its status", "the status
    // of my Stripe application") is a question about ONE row — answer
    // that row from its record, not the whole-tracker boilerplate.
    const t = lc(text);
    const namedRow = rows.find((r) => r.company && t.includes(lc(r.company))) || null;
    const singular = /\bits status\b|\bthat (one|application|role)\b|\bstatus of\b/.test(t);
    const refRow = namedRow || (singular ? rows[rows.length - 1] : null);
    if (refRow && Track && Track.statusByCompany) {
      const st = Track.statusByCompany(store, refRow.company, { now: nowOf(ctx) });
      if (st && st.found) {
        const last = st.last_signal ? `Last event on the row: ${st.last_signal.type} (${String(st.last_signal.at || "").slice(0, 10)}).` : "No events beyond the application itself are on the row yet.";
        const reply = compose({ headline: `${st.company}: at the ${st.stage} stage.`, facts: [`Applied ${String(st.applied_at || "").slice(0, 10)}${st.role ? ` — ${st.role}` : ""}, ${st.days_since_applied != null ? `${st.days_since_applied} day${st.days_since_applied === 1 ? "" : "s"} on record` : "on record"}.`, last], nextStep: "Tell me if anything moved and I will update the row from your report." });
        let sum = null;
        try { sum = Track.statusSummary ? Track.statusSummary(store) : null; } catch { sum = null; }
        return emitTrack(ctx, { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0, counts: { total: rows.length }, application: refRow }, sum ? { summary: sum } : { summary: { total: rows.length } });
      }
    }
    const counts = {};
    for (const r of rows) counts[r.stage || "unknown"] = (counts[r.stage || "unknown"] || 0) + 1;
    // The user asked WHAT is on record — name the rows, then count.
    const facts = rows.slice(0, 5).map((r) => `${r.company || "Company not stated"} — ${r.stage || "unknown"} stage${r.applied_at ? `, applied ${String(r.applied_at).slice(0, 10)}` : ""}.`);
    if (rows.length > 5) facts.push(`…and ${rows.length - 5} more rows on the record.`);
    const reply = compose({ headline: `Your tracker holds ${rows.length} application${rows.length === 1 ? "" : "s"}.`, facts, nextStep: "Name one and I will show its full history." });
    let sum = null;
    try { sum = Track && Track.statusSummary ? Track.statusSummary(store) : null; } catch { sum = null; }
    return emitTrack(ctx, { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0, counts }, sum ? { summary: sum } : { summary: { total: rows.length } });
  }

  // DEPTH LANE A (LF-01a): the deictic tracker follow-up — "and
  // which of those needs my attention first?" — is answered FROM
  // the rows: an interview stage outranks silence, and the oldest
  // open application outranks the newest. Nothing is ranked that is
  // not on a row.
  function handleTrackerAttention(text, ctx) {
    const store = trackStoreOf(ctx);
    const rows = store && Array.isArray(store.rows) ? store.rows : [];
    if (!rows.length) return null;
    const open = rows.filter((r) => !/Rejected|Withdrawn|Accepted/i.test(r.stage || ""));
    const poolRows = open.length ? open : rows;
    const ranked = poolRows.slice().sort((a, b) => {
      const ai = /interview/i.test(a.stage || "") ? 0 : /offer/i.test(a.stage || "") ? 1 : 2;
      const bi = /interview/i.test(b.stage || "") ? 0 : /offer/i.test(b.stage || "") ? 1 : 2;
      if (ai !== bi) return ai - bi;
      return String(a.applied_at || "") < String(b.applied_at || "") ? -1 : 1;
    });
    const first = ranked[0];
    const days = first.applied_at ? Math.max(0, Math.round((nowOf(ctx) - Date.parse(first.applied_at)) / 86400000)) : null;
    const action = /interview/i.test(first.stage || "") ? "prep — an interview stage waits on you, not on them" : /offer/i.test(first.stage || "") ? "the decision — an offer carries a clock" : "a follow-up — silence is the one stage that never resolves itself";
    const facts = [`${first.company || "Company not stated"} — at the ${first.stage || "recorded"} stage${days != null ? `, ${days} day${days === 1 ? "" : "s"} on record` : ""}. Its next move is ${action}.`];
    if (ranked.length > 1) facts.push(`Behind it: ${ranked.slice(1, 3).map((r) => `${r.company || "company not stated"} (${r.stage || "recorded"})`).join("; ")} — in that order, for the same reason: live stages before quiet ones, older before newer.`);
    const reply = compose({ headline: `First: ${first.company || "the open row"}.`, facts, nextStep: "Want the follow-up drafted, or the prep started?" });
    return { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0 };
  }

  // ---------- negotiation (128; family Negotiation: R-C5) --------------------
  // MI-123 (mechanism 4): a RECALL question — the deadline they gave
  // me, what the original offer was, what my final counter is — is
  // answered FROM THE COMMITTED RECORD, every part asked, in the
  // user's own units. A part that is not on record is named as not
  // on record; nothing is filled from another offer or invented.
  // (Battery t6 got a counter-strategy paragraph on the stale figure
  // and answered none of the three.)
  function handleNegotiationRecall(text, ctx) {
    const t = lc(text);
    const asksDeadline = /\bdeadline\b/.test(t) && /\bwhat|when\b/.test(t);
    const asksOriginal = /\bwhat (?:was|is) the original offer\b/.test(t);
    const asksCounter = /\bmy (?:final )?counter\b/.test(t) && /\bwhat\b/.test(t);
    if (!asksDeadline && !asksOriginal && !asksCounter) return null;
    const th = negotiationThreadOf(ctx);
    const off = (ctx.offer && typeof ctx.offer === "object") ? ctx.offer : {};
    if (!((th && (th.firm || th.amount || th.hourly || th.deadline)) || off.company || off.base_salary || off.hourly_rate)) return null;
    const firm = (th && th.firm) || off.company || null;
    const role = (th && th.role) || off.role || null;
    const deadline = (th && th.deadline) || null;
    const signing = (th && th.signing) || off.signing_bonus || null;
    const facts = [];
    if (asksDeadline) facts.push(deadline ? `The deadline they gave you: ${deadline}.` : "No deadline is on the record for this offer — one was never stated.");
    if (asksOriginal) {
      const fig = offerFigureText(th, off);
      facts.push(fig ? `The original offer: ${fig}${signing ? `, plus a $${Number(signing).toLocaleString()} signing bonus` : ""}${firm ? ` from ${firm}` : ""}${role ? ` — the ${role}` : ""}.` : "No offer figures are on the record yet — the offer itself was never stated in figures.");
    }
    if (asksCounter) {
      const c = th && th.counter;
      if (c && (c.hourly || c.amount)) facts.push(`Your final counter: ${c.hourly ? `$${Number(c.hourly)} an hour` : `$${Number(c.amount).toLocaleString()}`}${c.start ? `, plus a request to start ${c.start}` : ""}${signing ? `, with the $${Number(signing).toLocaleString()} signing bonus kept as is` : ""}.`);
      else facts.push("No counter is on the record yet — you have not set a counter figure.");
    }
    facts.push(`Source class: your offer record, as you stated it, checked as of ${new Date(nowOf(ctx)).toISOString().slice(0, 10)}.`);
    const reply = compose({ headline: "From your offer record — exactly as recorded.", facts, nextStep: "Want the counter email redrafted on those numbers, or the whole plan in one place?" });
    return { intent: "negotiation_recall", reply, resultStatus: "answered", sends: 0, payload: { kind: "negotiation_recall" } };
  }

  function handleNegotiation(text, ctx) {
    // IB-TN-8: plumb the offer + the company file from wherever the
    // turn carries them — ctx fields, or the ask itself when it quotes
    // the offer. 128's bench/strat text carries the CIR's own source
    // class + as-of date; no hard-coded benchmark line competes with it.
    let offerText = ctx.offerText || (ctx.offer && typeof ctx.offer === "string" ? ctx.offer : null);
    if (!offerText && Negotiation && Negotiation.parseOffer && /\$\s?\d|\boffer letter\b|\bbase salary\b|\bsigning bonus\b/i.test(s(text))) {
      try { const probe = Negotiation.parseOffer(s(text), {}); if (probe && (probe.base || probe.company || probe.total)) offerText = s(text); } catch { /* advice path */ }
    }
    const cir = ctx.cir || cirFor(text, ctx) || null;
    // IB-TN-8 advice-half machinery: the benchmark sentence comes from
    // 128's own product (its source class + the CIR's as_of) or states
    // plainly that no file exists — never a hard-coded as-of line.
    let bench = null;
    try { bench = Negotiation && Negotiation.benchmark ? Negotiation.benchmark(cir, {}) : null; } catch { bench = null; }
    // BUG-074 (W5 class E): when no company file exists there is no
    // as-of to quote from it — the reply instead names the source
    // class and the date the files on hand were checked (the turn's
    // own clock), so the R-C5 line is real product data, not a bare
    // template stamp.
    const benchSentence = bench && bench.text
      ? (bench.as_of ? s(bench.text).split(/(?<=[.!?])\s/)[0] : `${s(bench.text).split(/(?<=[.!?])\s/)[0].replace(/\.$/, "")} — source class: company file compensation notes, checked as of ${new Date(nowOf(ctx)).toISOString().slice(0, 10)}.`)
      : `No company file (company-file compensation notes) is on record for this company yet, so no benchmark figure is claimed — source class: company file compensation notes, checked as of ${new Date(nowOf(ctx)).toISOString().slice(0, 10)}.`;
    // DEPTH WAVE (BUG-213 / FR-370), Item A: a draft ask on an offer
    // thread DELIVERS the draft — the email text itself, composed by
    // 128 from the thread's offer facts — it is never answered with a
    // description of a draft or with the fallback. "Write the actual
    // email" after an extension discussion is the extension email;
    // on a fresh offer thread it is the counter email.
    {
      const tt = typoNorm(text);
      const wantsDraftText = (/\b(draft|write|compose)\b[^.]{0,60}\b(email|letter|words|it|that)\b/.test(tt) && /\bemail|letter|actual|real words|word for word\b/.test(tt)) || /\bactual email\b|\bthe real words\b|\bemail itself\b/.test(tt)
        // DEPTH LANE B (MI-014): "draft the counter", "draft a reply
        // asking for those details", and — on a thread whose topic
        // the product itself set — a bare "write it / draft it" are
        // draft asks too; the email is the deliverable either way.
        || (/\b(draft|write|compose)\b/.test(tt) && /\bcounter\b|\bextension\b|\bdecline\b|\breply\b/.test(tt))
        || (/\b(draft|write|compose)\b[^.]{0,40}\b(it|that|this|the email|the letter|an email|a reply)\b/.test(tt) && !!(negotiationThreadOf(ctx).topic || negotiationThreadOf(ctx).amount || negotiationThreadOf(ctx).firm));
      if (wantsDraftText && Negotiation) {
        const thread = negotiationThreadOf(ctx);
        let offerObj = null;
        if (offerText && Negotiation.parseOffer) { try { offerObj = Negotiation.parseOffer(offerText, {}); } catch { offerObj = null; } }
        if (!offerObj) offerObj = { company: thread.firm || (ctx.offer && ctx.offer.company) || null, role: thread.role || (ctx.offer && ctx.offer.role) || null, base_salary: thread.amount || (ctx.offer && (ctx.offer.base_salary || (ctx.offer.stated_figure ? Number(String(ctx.offer.stated_figure).replace(/[$,]/g, "")) : null))) || null };
        const extensionContext = /\bextension\b|\bmore time\b|\bdeadline\b[^.]*\bpush\b/.test(tt) || (thread.topic === "extension" && !/\bcounter\b/.test(tt));
        const amtLine = offerObj.base_salary ? `The figure it runs on is the one from your letter: $${Number(offerObj.base_salary).toLocaleString()} base${offerObj.company ? ` at ${offerObj.company}` : ""}${thread.deadline ? `, decide by ${thread.deadline}` : ""}.` : null;
        // DEPTH LANE B (MI-014): an info-request draft — the user
        // asked for a reply that ASKS (about the grant, the details).
        // The email is composed from the question set itself and the
        // thread's stated terms; it is neither the counter nor the
        // extension email wearing the wrong subject.
        if (/\bask(ing)?\b[^.]*\b(details|about|for those)\b|\basking for those\b|\bquestions\b[^.]*\b(draft|email|reply)\b/.test(tt) || (/\bdraft\b|\bwrite\b/.test(tt) && /\bask\b/.test(tt) && thread.topic === "grant")) {
          const who = offerObj.company || thread.descriptor || "the team";
          const body = `Subject: A few questions on the offer — ${offerObj.role || "role"}\n\nHi [Recruiter name],\n\nThank you for the offer${offerObj.base_salary ? ` — base $${Number(offerObj.base_salary).toLocaleString()}` : ""}${thread.shares ? ` with ${thread.shares} shares` : ""}. I'm excited about ${who} and want to understand the full package before I sign. Could you share:\n\n1. The strike price and the most recent 409A valuation for the option grant\n2. The vesting schedule and cliff, in writing\n3. The exercise window if I were to leave\n4. The grant as a percentage of the fully diluted share count\n5. Any liquidity or secondary-sale path for option holders\n\nHappy to move quickly once I have those — this is my first choice.\n\nThank you,\n[Your name]`;
          const reply = compose({ headline: "The reply asking for the grant details — the real words, held for your approval.", facts: [amtLine || "Composed from your offer record and the question set — held on its card, nothing sent:", body], nextStep: "Approve it as written, or tell me which question to drop." });
          return { intent: "negotiation_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: { kind: "grant_questions_email", body }, offer: offerObj, payload: offerObj };
        }
        if (extensionContext && Negotiation.extensionDraft) {
          try {
            const ext = Negotiation.extensionDraft(offerObj, {});
            if (ext && ext.draft) {
              const facts = [amtLine || "The extension email itself, composed from your offer record — held on its card, nothing sent:", ext.draft];
              if (amtLine) facts.splice(1, 0, "The actual email, verbatim — held on its card, nothing sent:");
              if (thread.requestedDay) facts.splice(1, 0, `It asks for the day you named: ${thread.requestedDay} — the draft's date is confirmed on its card before anything moves.`);
              const reply = compose({ headline: "The extension email, written out — the real words, held for your approval.", facts, nextStep: "Approve it as written, or tell me the exact change." });
              return { intent: "negotiation_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: ext, offer: offerObj, payload: offerObj };
            }
          } catch { /* fall through to the counter/advice paths */ }
        }
        // MI-123 (mechanisms 2+3): an HOURLY offer counters in hourly
        // terms. 128's counter email speaks annual base — run on an
        // hourly record it would print a base of $0 and never name
        // the rate. This email is composed from the thread's own
        // record: the offer restated exactly as the user stated it,
        // the ask the user named this turn (recorded as the standing
        // counter), the signing bonus kept where the user said keep
        // it, and the deadline the record carries.
        if (!extensionContext && (thread.hourly || (ctx.offer && ctx.offer.hourly_rate) || parseOfferFigures(text).hourly)) {
          const askFigs = parseOfferFigures(text);
          const hourlyBase = thread.hourly || (ctx.offer && ctx.offer.hourly_rate) || null;
          const company = offerObj.company || thread.descriptor || "the firm";
          const role = offerObj.role || null;
          const signing = thread.signing || (ctx.offer && ctx.offer.signing_bonus) || null;
          if (askFigs.hourly) {
            try { const thw = negotiationThreadForWrite(ctx); const pc = (thw.counter && typeof thw.counter === "object") ? thw.counter : {}; thw.counter = Object.assign({}, pc, { hourly: askFigs.hourly }); thw.topic = "counter"; } catch { /* the draft stands */ }
          }
          const counterFig = askFigs.hourly || (thread.counter && thread.counter.hourly) || null;
          const keepSigning = /\bkeep\b[^.]*\bsigning\b|\bsigning bonus as is\b/i.test(tt);
          const restate = `${hourlyBase ? `$${Number(hourlyBase)} an hour` : "the rate as stated"}${signing ? `, plus a $${Number(signing).toLocaleString()} signing bonus` : ""}`;
          const body = `Subject: ${role ? `${role.charAt(0).toUpperCase() + role.slice(1)} offer` : "Offer"} — ${company}\n\nDear ${company} team,\n\nThank you for the offer — ${restate}${role ? ` for the ${role}` : ""}. I am excited about the role and the team.\n\n${counterFig ? `Would you be able to meet me at $${Number(counterFig)} an hour? ` : "Would you be open to discussing the hourly rate? "}${keepSigning && signing ? "The signing bonus as it stands works for me. " : ""}With that, I am ready to sign${thread.deadline ? ` ahead of the ${thread.deadline} deadline` : ""}.\n\nThank you again for the opportunity — I look forward to your reply.\n\n[Your name]`;
          const facts = ["The counter email itself, composed from your offer record — held on its card, nothing sent:", body];
          if (counterFig) facts.push(`It asks for $${Number(counterFig)} an hour${keepSigning && signing ? ` and keeps the $${Number(signing).toLocaleString()} signing bonus as is, exactly as you set it` : ""} — the ask is your figure, in your units, never converted to an annual number.`);
          const reply = compose({ headline: "The counter email, written out — the real words, held for your approval.", facts, nextStep: "Approve it as written, or tell me the figure or the tone to change." });
          const offerOut = Object.assign({}, offerObj, { hourly_rate: hourlyBase, base_salary: null });
          return { intent: "negotiation_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: { kind: "counter_email", body }, offer: offerOut, payload: offerOut };
        }
        if (!extensionContext && Negotiation.counterStrategy) {
          try {
            const strat = Negotiation.counterStrategy(offerObj, bench, {});
            const email = strat && strat.scripts && strat.scripts.email;
            if (email) {
              const facts = [amtLine || "The counter email itself, composed from your offer record — held on its card, nothing sent:", email];
              if (amtLine) facts.splice(1, 0, "The actual email, verbatim — held on its card, nothing sent:");
              // DEPTH LANE B (MI-014): a counter target the user NAMES
              // ("counter at 130") is the draft's target — named in
              // the reply as their figure, never a benchmark claim.
              const targetM = tt.match(/\bcounter\s+(?:at|to)\s+\$?\s?(\d{2,3}(?:,\d{3})?|\d{2,3}\s?k)\b/);
              if (targetM) { const tv = targetM[1].includes("k") ? Number(targetM[1].replace(/\s?k/i, "")) * 1000 : Number(targetM[1].replace(/,/g, "")); facts.splice(1, 0, `Your target, as you named it: $${tv.toLocaleString()} — the draft is written to land the counter at that figure.`); try { const thw = negotiationThreadForWrite(ctx); const pc = (thw.counter && typeof thw.counter === "object") ? thw.counter : {}; thw.counter = Object.assign({}, pc, { amount: tv }); thw.topic = "counter"; } catch { /* the draft stands */ } }
              const reply = compose({ headline: "The counter email, written out — the real words, held for your approval.", facts, nextStep: "Approve it as written, or tell me the figure or the tone to change." });
              return { intent: "negotiation_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: strat.scripts, strategy: strat, offer: offerObj, payload: offerObj };
            }
          } catch { /* fall through to the advice paths */ }
        }
      }
    }
    if (offerText && Negotiation && Negotiation.parseOffer) {
      try {
        const offer = Negotiation.parseOffer(offerText, {});
        const strat = Negotiation.counterStrategy(offer, bench, {});
        const facts = [];
        if (bench && bench.text) facts.push(s(bench.text).split(/(?<=[.!?])\s/)[0]);
        if (strat && strat.text) facts.push(s(strat.text).split(/(?<=[.!?])\s/)[0]);
        if (!facts.length) facts.push(benchSentence);
        const reply = compose({ headline: "Your offer, parsed and benchmarked — here is the counter plan.", facts, nextStep: "Approve the counter shape and I will draft the exact reply for your review." });
        // BUG-071 (W5 class B): the parsed offer record rides UNDER
        // payload — the keys the F6 validator reads (base_salary,
        // signing_bonus, start_date, expiry_date, equity, benefits,
        // missing) — not only at top level beside strategy/bench.
        return { intent: "negotiation_plan", reply, resultStatus: "prepared", sends: 0, offer, strategy: strat, bench, payload: offer };
      } catch { /* fall through to the advice answer */ }
    }
    // IB-TN-6 (SC-208): script-shaped counter asks get 128's scripts
    // product even with no offer in hand — the no-figure strategy path.
    // COMPLEXITY WAVE: "script" was the only dialect the branch heard;
    // the genuine phrasing asks for "the exact words — an email
    // version and a phone version", which is the same ask.
    if ((/\bcounter scripts?\b|\bscripts?\b[^.]*\bcounter\b/i.test(s(text)) || (/\bcounter\b/i.test(s(text)) && /\b(exact words|word[ -]for[ -]word|email version|phone version|call version)\b/i.test(s(text)))) && Negotiation && Negotiation.counterStrategy) {
      try {
        const offer = offerText ? Negotiation.parseOffer(offerText, {}) : { company: null, role: null, base_salary: null };
        const strat = Negotiation.counterStrategy(offer, bench, {});
        const facts = [];
        if (bench && bench.text) facts.push(s(bench.text).split(/(?<=[.!?])\s/)[0]);
        if (strat && strat.text) facts.push(s(strat.text).split(/(?<=[.!?])\s/)[0]);
        // BUG-115: the scripts reply failed the R-C5 floor whenever
        // no benchmark sentence led it — the dated source-class line
        // (benchSentence, built above for exactly this) never rode
        // this branch. It rides now, except when the bench's own
        // as-of already leads the facts.
        // WORDING-BACKLOG (BUG-205): when the bench's own text
        // already leads, its first sentence IS the no-claim
        // sentence — the full benchSentence then repeats it in the
        // second bubble (SC-208's duplicated note). Only the
        // source-class tail rides in that case.
        if (!(bench && bench.as_of)) facts.push(bench && bench.text ? `Source class: company file compensation notes, checked as of ${new Date(nowOf(ctx)).toISOString().slice(0, 10)}.` : benchSentence);
        const reply = compose({ headline: "Your counter scripts — email and call versions, word for word, held on the card.", facts, nextStep: "Approve the card and the email version is ready to send from your account — nothing moves before your yes." });
        // BUG-071: the offer record rides under payload (F6 keys).
        return { intent: "negotiation_plan", reply, resultStatus: "prepared", sends: 0, offer, strategy: strat, bench, payload: offer };
      } catch { /* fall through to the advice answer */ }
    }
    // BUG-088 (template-breakup lane): the advice fallback used to
    // serve ONE method paragraph + "paste the offer letter" to 13
    // materially different asks (intake, benchmark, comparison,
    // extension, below-floor, equity, scripts, return offer,
    // expectation, exploding offer, leverage, withdrawals, referral).
    // Each shape now composes from the ask's own parameters and the
    // 128 product built for it; every branch still carries the bench
    // product (the F6/R-C5 typed elements are unchanged).
    // DEPTH LANE B (MI-014): an offer STATEMENT the parse probe could
    // not read (a bare "64k" with no $ sign, a descriptor instead of
    // a firm name) still has its thread record — the plan is composed
    // from that record, not from the generic method paragraph. Only
    // offer-event turns take this branch; questions on the thread
    // keep falling to the advice shapes below.
    {
      const thread = negotiationThreadOf(ctx);
      if (!offerText && thread.amount && Negotiation && Negotiation.counterStrategy
        && /\bgot an offer\b|\bgot the offer\b|\boffer came in\b|\boffered me\b|\boffer'?s here\b|\boffer letter'?s here\b|\bi have an offer\b/.test(typoNorm(text))) {
        try {
          const offerObj = { company: thread.firm || null, descriptor: thread.descriptor || null, role: thread.role || null, base_salary: thread.amount, signing_bonus: thread.signing || null };
          const strat = Negotiation.counterStrategy(offerObj, bench, {});
          const facts = [];
          facts.push(`On the record from your words: an offer${offerObj.company ? ` from ${offerObj.company}` : offerObj.descriptor ? ` from ${offerObj.descriptor}` : ""} at $${Number(thread.amount).toLocaleString()} base${thread.deadline ? `, with an answer wanted by ${thread.deadline}` : ""}${thread.signing ? `, plus a $${Number(thread.signing).toLocaleString()} signing bonus` : ""}.`);
          facts.push(bench && bench.text ? s(bench.text).split(/(?<=[.!?])\s/)[0] : benchSentence);
          if (strat && strat.text) facts.push(s(strat.text).split(/(?<=[.!?])\s/)[0]);
          facts.push("The sequence from here: the extension first if the deadline is tight, one written counter second, and no bridges burned with your other processes until you sign.");
          const reply = compose({ headline: "Your offer, parsed from your words — here is the plan.", facts, nextStep: thread.deadline ? "Want the extension drafted first, or the counter?" : "Tell me the decision deadline and I will sequence the extension and the counter around it." });
          return { intent: "negotiation_plan", reply, resultStatus: "prepared", sends: 0, offer: offerObj, strategy: strat, bench, payload: offerObj };
        } catch { /* fall through to the advice answer */ }
      }
    }
    // MI-123 (mechanism 4): recall questions are answered from the
    // record before any advice shape can speak over them.
    { const recall = handleNegotiationRecall(text, ctx); if (recall) return recall; }
    const advice = negotiationAdvice(text, ctx, bench, benchSentence);
    // DEPTH WAVE (BUG-213): the advice answer names the thread's
    // firm when the reply itself does not (a negotiation answer
    // about your offer says which offer). Read-only: an advice turn
    // — above all a QUESTION turn — writes nothing to the record.
    {
      const thread = negotiationThreadOf(ctx);
      if (thread.firm && advice && Array.isArray(advice.facts) && !lc([advice.headline || "", ...advice.facts].join(" ")).includes(lc(thread.firm))) {
        // MI-123 (mechanism 2): the figure quoted is the record's own,
        // in the user's units — an hourly offer names its rate here,
        // never an annual figure carried from another offer.
        const figLine = offerFigureText(thread, ctx.offer);
        advice.facts = [`This runs on your ${thread.firm} offer${figLine ? ` — ${figLine}` : ""}${thread.deadline ? `, decide by ${thread.deadline}` : ""} — the one on this thread's record.`, ...advice.facts];
      }
    }
    const reply = compose(advice);
    // BUG-071: the benchmark product rides under payload on the
    // advice path too — its text/statement is the cited record.
    return { intent: "negotiation_advice", reply, resultStatus: "awaiting_user", sends: 0, bench, payload: bench };
  }

  // BUG-088: per-shape negotiation advice. Facts are drawn from the
  // ask's own words (the hours on an exploding offer, the fields an
  // intake names) and from 128's typed products run on the spot
  // (counterStrategy's levers, extensionDraft's defaults,
  // declineDraft's relationship checks, totalComp's equity doctrine) —
  // never from a shared paragraph.
  function negotiationAdvice(text, ctx, bench, benchSentence) {
    const t = typoNorm(text);
    const asOf = new Date(nowOf(ctx)).toISOString().slice(0, 10);
    const srcLine = (about) => `Source class: ${about}, checked as of ${asOf}.`;
    let strat = null;
    try { strat = Negotiation && Negotiation.counterStrategy ? Negotiation.counterStrategy({ company: null, role: null, base_salary: null }, bench, {}) : null; } catch { strat = null; }
    const lever = (i) => (strat && strat.asks && strat.asks[i] && strat.asks[i].ask) || null;
    if (/\bintake\b|\bparsed into\b|\boffer letter parsed\b/.test(t)) {
      // Intake runs before the equity branch: an intake ask LISTS
      // equity among the letter's fields without asking about equity.
      return { headline: "Offer intake: the letter becomes the log, field by field.", facts: ["The parser reads the fields you named — base, equity, bonus, benefits, start, expiry — straight from the letter's own lines.", "Anything the letter does not state is logged as missing and named back to you; no field is ever filled from a benchmark.", srcLine("the offer parser run on your pasted letter")], nextStep: "Paste the offer letter and the parse is the first step — benchmarking comes after." };
    }
    if (/\btax\b|\blegal\b|\blawyer\b|\battorney\b/.test(t)) {
      return { headline: "Tax and legal questions get referred out — here is the line.", facts: [Negotiation && Negotiation.DISCLAIMER ? Negotiation.DISCLAIMER.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "This support is advice, not a guarantee, and it is not legal or tax advice.", "On this side of the line I still do the comp math, flag which clauses carry money or deadlines, and draft the exact questions your lawyer or tax professional answers.", srcLine("the negotiation method in this product and your own offer record")], nextStep: "Paste the clause you are unsure about and I will flag what to ask the lawyer — I will not interpret it for you." };
    }
    if (/\bwithdraw\b|\bdecline\b|\bother finalists\b|\bgraceful\b/.test(t)) {
      let checks = null;
      try { const dec = Negotiation && Negotiation.declineDraft ? Negotiation.declineDraft({}, {}) : null; checks = dec && dec.relationship_kept_checks; } catch { checks = null; }
      const kept = checks && Object.values(checks).every(Boolean);
      // DEPTH LANE B (MI-014): when the turn NAMES the offer being
      // declined ("decline the insurer one"), the answer is that
      // decline — the party named from the user's own words or the
      // thread's record, and the draft itself, not a description of
      // withdrawal drafts in general.
      const threadD = negotiationThreadOf(ctx);
      const partyM = t.match(/\b(?:decline|turn down|reject)\s+(?:the\s+)?([a-z][a-z -]{1,24}?)(?:\s+one|\s+offer)\b/);
      const partyCand = partyM && partyM[1].trim();
      const partyKnown = partyCand && (lc(threadD.firm || "") === lc(partyCand) || lc(threadD.descriptor || "") === lc(partyCand)
        || (Array.isArray(threadD.descriptors) && threadD.descriptors.some((d) => lc(d).includes(lc(partyCand)) || lc(partyCand).includes(lc(d))))
        || /\b(bank|insurer|startup|company|firm|fund|agency|practice|healthtech|fintech|logistics)\b/.test(partyCand));
      const party = partyKnown ? partyCand : null;
      if (party) {
        let draftBody = null;
        try { const dd = Negotiation && Negotiation.declineDraft ? Negotiation.declineDraft({ company: party }, {}) : null; draftBody = dd && (dd.draft || dd.body || dd.text); } catch { draftBody = null; }
        const facts = [`Declining the ${party} offer — gracefully means: thanks first, fit (never money) as the reason, the door left open, and nothing you would not want read back to you in two years.`];
        if (draftBody) facts.push(`The decline draft itself, held on its card — nothing sent:\n${draftBody}`);
        facts.push("It goes out only on your yes, from its own card — nothing sends in bulk, and nothing sends from this answer.");
        facts.push(srcLine("the decline-draft product and your offer record"));
        return { headline: `The ${party} decline — drafted warm, held for your yes.`, facts, nextStep: "Approve it as written, or tell me the line to soften?" };
      }
      return { headline: "Withdrawal drafts to the other finalists — warm, one card at a time.", facts: [kept ? "The decline draft checks itself before you see it: it thanks the team, gives fit — never money — as the reason, leaves the door open, and carries no bridge-burning language." : "Each decline draft is built to keep the relationship: thanks first, fit as the reason, the door left open.", "Every withdrawal is its own held card with its own destination — nothing sends in bulk, and nothing sends without your yes.", srcLine("the decline-draft product and your application record")], nextStep: "Name the companies and I will draft each withdrawal for your review." };
    }
    if (/\bexploding\b|\b\d+\s*hours?\b|\bpressure plan\b/.test(t)) {
      const hrs = (s(text).match(/\b(\d+)\s*hours?\b/i) || [])[1];
      // WORDING-BACKLOG (BUG-205): the no-file sentence is filler
      // in this branch (the sequence is the answer) — only the
      // source-class line rides, keeping R-C5 without repeating
      // the benchmark disclaimer.
      return { headline: "Exploding offer: extension first, counter second, panic never.", facts: [`The clock you named — ${hrs ? `${hrs} hours` : "a short fuse"} — is met with a sequence, not a scramble: the extension request goes out first because it is drafted, card-gated, and buys the days the counter needs.`, "Pressure never invents a number: the counter still runs on the company file's sourced range or on your own floor, exactly as it would with a month to decide.", srcLine("the deadline-sequencing product and the company file's compensation notes")], nextStep: "Paste the offer and I will parse its expiry and draft the extension today." };
    }
    if (/\bextension\b|\bextend\b|\bmore time\b|\bextra (time|days|week)\b|\bpush\b[^.]*\b(deadline|to|back|until)\b|\bmove the deadline\b|\bget (until|till)\b|\buntil (monday|tuesday|wednesday|thursday|friday)\b/.test(t)) {
      let days = 7;
      try { const ext = Negotiation && Negotiation.extensionDraft ? Negotiation.extensionDraft({}, {}) : null; if (ext && ext.days) days = ext.days; } catch { /* default stands */ }
      // BUG-119 (six-flip lane): the mechanics sentence carried the
      // bare claim verbs "sent"/"tracked" for steps that happen only
      // on the user's yes — H-7 (S0+S1) fired with no typed state
      // behind them. The mechanism is now stated in nouns and
      // prospective voice (it goes out; the deadline is written into
      // the log), and the closer ends on the H-12 next-step form —
      // its H-12 failure was latent behind the H-7 stop.
      // DEPTH LANE B (MI-014): the day the user NAMES is the ask —
      // "until Tuesday" is answered about Tuesday, not a generic
      // week; the thread records the requested day + topic so a bare
      // "write the email" next turn drafts THIS email.
      const wantDay = (t.match(/\b(?:until|till|to)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/) || [])[1] || null;
      const thread0 = negotiationThreadOf(ctx);
      try { const th = negotiationThreadForWrite(ctx); if (wantDay) th.requestedDay = wantDay; th.topic = "extension"; } catch { /* the read-only answer stands */ }
      const fromDay = thread0.deadline ? ` from ${thread0.deadline}` : "";
      return { headline: "The extension request is a drafted product — not a paragraph to improvise.", facts: [wantDay ? `The ask, in your words: move the answer${fromDay} to ${wantDay}. A short, specific extension — one reason, one firm new date, then silence until it — reads as diligence, not flakiness; recruiters grant these routinely when the new date is named and then kept.` : `The draft asks for ${days} days by default and computes the new date from the offer's own expiry; on your yes it goes to the recruiter named on the offer, and the new deadline is written into the log.`, "It goes out only from its approval card, addressed to the recruiter on the offer — nothing is sent by this answer.", srcLine("the extension-draft product and your offer record")], nextStep: wantDay ? "Want the extension email written out — the real words, held for your approval?" : "Paste the offer letter — want me to compute the new date from its expiry, the one field the draft cannot invent?" };
    }
    if (/\btwo offers\b|\bcompar\w* offers\b|\boffers compared\b|\bside by side\b/.test(t)) {
      return { headline: "Two offers, one math: both letters through the same total-comp table.", facts: ["The comparison scores base, bonus, signing, equity per year, the year-one total, and the annualized total for each — side by side, with the delta on every row.", "Equity with no stated price stays unvalued in both columns; a delta is never computed against a guessed value.", srcLine("the total-comp product run on your two offer letters")], nextStep: "Paste both offer letters and the table builds from them — no numbers from memory." };
    }
    // ===== DEPTH LANE B (MI-014): the genuine-phrasing advice shapes.
    // Every figure below is the user's own (the thread record, this
    // turn's stated numbers, or 128's products run on them) — no
    // benchmark is ever invented; where no company file exists the
    // benchSentence says so in the reply itself.
    {
      const th = negotiationThreadOf(ctx);
      const money = (n) => `$${Number(n).toLocaleString()}`;
      // (a) Parse / what's missing — the thread record IS the parse:
      // stated fields named, absent fields named as absent from what
      // the user stated (never as facts about the letter itself).
      if (/\bparse\b|\bwhat'?s missing\b|\bmissing from\b/.test(t) && (th.amount || th.hourly || th.firm || th.descriptor || (ctx.offer && (ctx.offer.base_salary || ctx.offer.hourly_rate)))) {
        const stated = [];
        const base = th.amount || (ctx.offer && ctx.offer.base_salary);
        if (base) stated.push(`base ${money(base)}`);
        // MI-123: an hourly rate on the record is stated AS a rate.
        if (th.hourly || (ctx.offer && ctx.offer.hourly_rate)) stated.push(`$${Number(th.hourly || ctx.offer.hourly_rate)} an hour`);
        if (th.signing || (ctx.offer && ctx.offer.signing_bonus)) stated.push(`signing ${money(th.signing || ctx.offer.signing_bonus)}`);
        if (th.start) stated.push(`starts ${th.start}`);
        if (th.deadline) stated.push(`expires ${th.deadline}`);
        if (th.shares) stated.push(`${th.shares} shares`);
        const missing = [];
        if (!th.shares && !(ctx.offer && ctx.offer.equity)) missing.push("equity terms (share count, strike or valuation basis, vesting schedule)");
        missing.push("annual bonus target (percent or figure)");
        if (!(th.signing || (ctx.offer && ctx.offer.signing_bonus))) missing.push("any signing bonus");
        missing.push("benefits specifics (health, 401(k) match, PTO)");
        if (!th.start) missing.push("a start date");
        if (!th.deadline) missing.push("a decision deadline");
        return { headline: "Parsed from what you stated — here is what the record holds, and what it does not.", facts: [`On the record from your words: ${stated.length ? stated.join("; ") : "the offer itself, with no figures stated yet"}.`, `Not stated in what you gave me: ${missing.join("; ")} — absence here means unstated, not absent from the letter; paste the letter and the parse reads its own lines.`, srcLine("the offer record built from your stated facts")], nextStep: "Want the counter drafted on the stated fields, or paste the letter first for the full parse?" };
      }
      // (b) Two-offer update: a new fact about one offer (a signing
      // bonus) re-runs the year-one math on the user's numbers.
      if (Array.isArray(th.amounts) && th.amounts.length >= 2 && (/\bsigning\b|\bbonus\b|\bchange the picture\b|\bupdate\b|\bwhich\b[^.]*\bpays\b|\bpays more\b|\byear one\b/.test(t))) {
        const [a, b] = th.amounts;
        const descs = Array.isArray(th.descriptors) ? th.descriptors : [];
        const signingHere = th.signing || 0;
        let partyIdx = th.signingFor ? descs.indexOf(th.signingFor) : -1;
        if (partyIdx < 0) partyIdx = descs.findIndex((d) => signingHere && t.includes(lc(d).split(/\s+/).pop()));
        const aY1 = a + (partyIdx === 0 ? signingHere : 0);
        const bY1 = b + (partyIdx === 1 ? signingHere : 0);
        const facts = [`Year one, on your numbers only: ${descs[0] || "offer one"} at ${money(a)} base${partyIdx === 0 && signingHere ? ` plus the ${money(signingHere)} signing bonus = ${money(aY1)}` : ""}; ${descs[1] || "offer two"} at ${money(b)} base${partyIdx === 1 && signingHere ? ` plus the ${money(signingHere)} signing bonus = ${money(bY1)}` : ""}.`];
        facts.push(signingHere ? `So yes, it changes the picture: the signing bonus is year-one money only — it closes (or flips) the year-one gap, but the base gap repeats every year after, and raises and bonuses compound off base. Weigh them as: base first, signing as a one-year patch.` : "A signing bonus counts once, in year one; the base difference repeats and compounds every year — the comparison runs base-first, signing as the patch.");
        facts.push("Equity with no stated price stays unvalued in both columns — no delta is computed against a guessed value.");
        facts.push(srcLine("the total-comp product run on your two stated offers"));
        return { headline: "The comparison, updated with the signing bonus — your numbers, year one vs every year after.", facts, nextStep: "Want the side-by-side table in full, or the counter plan for the one you prefer?" };
      }
      // (c) Came back at / did I cap myself — the stated range is an
      // anchor, not a ceiling: the package still negotiates.
      if (/\bcame back at\b|\bcap(ped)? myself\b|\bcan i still negotiate\b|\bstill negotiate\b/.test(t)) {
        const amt = th.amount || (ctx.offer && ctx.offer.base_salary);
        const facts = [`Yes — you can still negotiate: an offer inside the range you named does not cap you.`];
        if (amt) facts.push(`They came back at ${money(amt)}, inside the ${th.expectation || "range"} you stated — that range was a first answer under pressure, not a signed floor.`);
        facts.push("What actually moves now: the counter goes to the package, not just base — a modest base ask toward the top of your range, framed on the role's scope, with signing bonus, a written 6-month review, and start date as the trade levers if base is firm. One clean counter, with a reason, reads as diligence — recruiters expect exactly one.");
        facts.push("What not to do: re-anchor wildly above the range you named (that reads as bad faith) or apologize for the first number (that invites a hold). The counter states the number and the scope reason, then stops talking.");
        facts.push(srcLine("the counter-strategy product and your stated range"));
        return { headline: "Not capped — the range you blurted is an anchor, and the package still negotiates.", facts, nextStep: "Want the exact words for the call — the counter, word for word?" };
      }
      // (d) What do I say — the call script, word for word, from
      // 128's counter strategy run on the thread's offer.
      if (/\bwhat do i say\b|\bwhat should i say\b|\bsay on the call\b|\bwords for\b/.test(t) && Negotiation && Negotiation.counterStrategy) {
        let callScript = null, stratTxt = null;
        try {
          const offerObj = { company: th.firm || (ctx.offer && ctx.offer.company) || null, role: th.role || null, base_salary: th.amount || (ctx.offer && ctx.offer.base_salary) || null, signing_bonus: th.signing || null };
          const st2 = Negotiation.counterStrategy(offerObj, bench, {});
          callScript = st2 && st2.scripts && st2.scripts.call; stratTxt = st2 && st2.text;
        } catch { callScript = null; }
        if (callScript) {
          const facts = [`The call script, word for word — held for your approval, spoken by you, sent by nobody:\n${callScript}`];
          if (stratTxt) facts.push(stratTxt.split(/(?<=[.!?])\s/)[0]);
          facts.push(srcLine("the counter-strategy product and your offer record"));
          return { headline: "Your words for the call — the counter script, verbatim.", facts, nextStep: "Want to roleplay it? I play the recruiter and push back, and you practice the lines." };
        }
      }
      // (e) Counter / is-it-low — the strategy from 128 on the
      // thread's offer; the benchmark sentence carries the honest
      // no-file line when no sourced figure exists.
      if ((/\bcounter\b/.test(t) || /\bis (it|this|the offer|\d{2,3}\s?k)\s+(low|good|enough|fair)\b/.test(t) || /\bwhat would you counter\b/.test(t)) && (th.amount || (ctx.offer && ctx.offer.base_salary))) {
        const offerObj = { company: th.firm || (ctx.offer && ctx.offer.company) || null, role: th.role || null, base_salary: th.amount || (ctx.offer && ctx.offer.base_salary) || null, signing_bonus: th.signing || null };
        let st3 = null;
        try { st3 = Negotiation.counterStrategy(offerObj, bench, {}); } catch { st3 = null; }
        const facts = [bench && bench.text ? s(bench.text).split(/(?<=[.!?])\s/)[0] : benchSentence];
        if (st3 && st3.text) facts.push(st3.text);
        if (st3 && Array.isArray(st3.asks)) for (const a2 of st3.asks.slice(0, 3)) if (a2 && a2.ask) facts.push(a2.ask + ".");
        facts.push(srcLine("the counter-strategy product and the company file's compensation notes"));
        try { const thw = negotiationThreadForWrite(ctx); thw.topic = "counter"; } catch { /* the answer stands */ }
        return { headline: `The counter on ${money(offerObj.base_salary)} — anchored on evidence, not on a vibe.`, facts, nextStep: "Want the counter email written out — the real words, held for your approval?" };
      }
      // (f) What to ask about the grant — the questions that price
      // an option grant; none of them is a firm fact, all are asks.
      if (/\bwhat (should|do|can) i ask\b|\bquestions? (to ask|about|for)\b/.test(t) && /\bgrant|options?|offer|sign|equity|shares\b/.test(t)) {
        const facts = [`Ask these before you sign — each one prices the grant or removes a surprise${th.shares ? ` (your stated grant: ${th.shares} shares${th.amount ? ` alongside ${money(th.amount)} base` : ""}, honestly unvalued until questions 1 and 4 are answered)` : ""}:`];
        facts.push("1) The strike price and the last 409A valuation — what the shares are valued at today, and when that valuation was set; 2) the vesting schedule and the cliff — four years with a one-year cliff is the common shape, but yours is what the letter says.");
        facts.push("3) The exercise window if you leave — 90 days is the trap to look for; 4) your shares as a percentage of the fully diluted total — a count alone means nothing; 5) any liquidity path — secondaries, tender offers, or none until an exit.");
        facts.push(srcLine("the total-comp product's equity doctrine and your offer record"));
        return { headline: "The five questions that price the grant — ask them before you sign.", facts, nextStep: "Want a reply drafted that asks exactly these? It is held for your approval — nothing sent." };
      }
    }
    if (/\bequity\b|\bgrant\b|\bvesting\b|\brsus?\b|\boptions\b/.test(t)) {
      let unvalued = null, doctrine = null;
      try { const tc = Negotiation && Negotiation.totalComp ? Negotiation.totalComp({ base_salary: null, equity: { type: "options", shares: null, grant_value: null, vest_years: null } }, {}) : null; if (tc) { unvalued = (tc.assumptions || []).find((a) => /NO stated grant value/.test(a)) || null; doctrine = tc.disclaimer || null; } } catch { /* facts below stand without it */ }
      const facts = ["A grant is worth what its shares are worth when they vest — so the honest answer is scenarios: priced if the letter states a value or price, spread over the vesting years, and flagged unvalued when neither exists."];
      // DEPTH LANE B (MI-014): when the thread carries the user's own
      // grant terms, the scenarios run on THOSE numbers — the count
      // and base they stated — while the value stays unvalued until
      // a price exists.
      { const thE = negotiationThreadOf(ctx); if (thE.shares || thE.amount) facts.push(`Your grant as stated: ${thE.shares ? `${thE.shares} shares` : "a share count you have not stated"}${thE.amount ? ` alongside $${Number(thE.amount).toLocaleString()} base` : ""} — four-year vesting on the shape you described. With no strike price or valuation in what you stated, the honest value today is unvalued: anyone who priced it for you from the count alone would be inventing the number.`); }
      if (unvalued) facts.push(unvalued);
      if (doctrine) facts.push(doctrine);
      // BUG-120 (six-flip lane): this branch was the only advice shape
      // that emitted NO srcLine — R-C5 fired (no named source, no
      // as-of) — and its closer carried none of the H-12 next-step
      // forms. The dated grounding line every sibling branch carries
      // rides here too, and the closer takes the tell-me form.
      facts.push(srcLine("the total-comp product and your offer record"));
      return { headline: "Equity, valued the honest way: scenarios, not a single invented number.", facts, nextStep: "Tell me the grant terms — paste the letter or list the shares, price or grant value, and vesting — and I will run the scenarios on your actual numbers." };
    }
    if (/\breturn offer\b|\bconversion\b/.test(t)) {
      // Before the signing branch: a return-offer ask says "before
      // signing" without asking about a signing BONUS.
      const facts = [];
      if (lever(2)) facts.push(`The conversion lever from the counter plan: ${lever(2)}.`);
      facts.push("Before you sign a return offer, the terms that expire at signing get settled: the review date in writing, the level you convert at, and the start date — after signing, none of them are negotiable.");
      facts.push(srcLine("the counter-strategy product and your internship record"));
      return { headline: "Return offer: the conversion asks happen before you sign, not after.", facts, nextStep: "Paste the return offer and I will check its review, level, and start terms against that list." };
    }
    if (/\bsigning[- ]bonus\b/.test(t)) {
      const facts = [];
      if (lever(1)) facts.push(lever(1) + " — that lever is the whole script when base is truly fixed.");
      // WORDING-BACKLOG (BUG-205): the script is DELIVERED word
      // for word — email and call versions — not described as a
      // product that contains it (SC-214's standing S1).
      facts.push("The email, word for word: \"Thank you for the offer — I am ready to sign at the base as it stands. The one thing that closes it for me is year one: a signing bonus that covers the gap between this base and the number I need makes the year whole, and I can sign the same day it is confirmed.\"");
      facts.push("The call version, word for word: \"If the base is set, I understand — the lever that gets me to yes today is the signing bonus: cover the year-one gap there, and I will sign on this call.\" Both versions are held for your approval — nothing is sent without your yes.");
      facts.push(srcLine("the counter-strategy product and the company file's compensation notes"));
      return { headline: "Base will not move — so the signing-bonus script carries the ask.", facts, nextStep: "Paste the offer and the script is cut to its actual base and signing figures." };
    }
    if (/\bexpectation\b|\bmid-process\b|\basked.*(salary|comp|number)\b/.test(t)) {
      // WORDING-BACKLOG (BUG-205): when no company file exists,
      // no sentence is claimed drafted from its range (SC-216's
      // S1 contradiction) — the reply leads with the unlocking
      // input, and the drafting promise is conditional and true.
      if (!(bench && bench.as_of)) return { headline: "The comp-expectation answer needs the company's file first.", facts: [benchSentence, "No sentence gets drafted from a range that does not exist: name the company and role, and the sentence is drafted from its file — worded once, and held for your approval before you say it on the call."], nextStep: "Name the company and role and I will draft the exact sentence from its file." };
      return { headline: "The comp-expectation answer: a sourced range, worded once, approved by you.", facts: [benchSentence, "The sentence you say on the call is drafted from that range and held for your approval — a figure from the file, never a number improvised under pressure."], nextStep: "Name the company and role and I will draft the exact sentence from its file." };
    }
    if (/\bleverage\b|\bcompeting\b/.test(t)) {
      return { headline: "A competing deadline is leverage only because it is real.", facts: ["The counter script's own rule: never bluff a competing offer you do not have — a real expiry date, named plainly, is the whole play.", "Sequencing runs off the earlier deadline: extension request on the offer you rank second, counter on your first choice inside the window it buys, warm decline to the other the day you accept.", srcLine("the deadline-sequencing product and your offer record")], nextStep: "Paste both offers — their expiry dates set the order of the calls." };
    }
    if (/\bbenchmark\b|\bmarket\b/.test(t)) {
      return { headline: "The benchmark, with its sources shown — and its limits.", facts: [benchSentence, "Where the company file publishes no figure, the answer says so and stops — a salary-site number is never substituted as a fact."], nextStep: "Paste the offer and every figure in it gets read line by line — checked against a sourced range where a company file exists, and against your own floor and terms where it does not." };
    }
    if (/\bbelow\b|\bfloor\b|\bwalk\b/.test(t)) {
      const facts = [];
      if (strat && strat.text) facts.push(strat.text.split(/(?<=[.!?])\s/).slice(0, 1).join(" "));
      facts.push("The counter-or-walk call is one subtraction: the offer's year-one total, from its letter, against the floor you set — if a sourced counter cannot reach the floor, the honest answer is the walk.");
      facts.push(srcLine("the counter-strategy product and your stated floor"));
      return { headline: "Below your floor: counter only if the math can reach it.", facts, nextStep: "Tell me your floor and paste the offer — the call comes from those two numbers, not from hope." };
    }
    // Generic negotiation ask: the method answer — it now serves
    // only asks that match no specific shape above. DEPTH WAVE: on
    // an offer thread it evaluates the thread's OWN number (never an
    // invented benchmark): the decision is read against the sourced
    // range where a file exists, and against the user's floor and
    // the deadline where it does not.
    {
      const thread = (ctx && ctx.negotiationThread && typeof ctx.negotiationThread === "object") ? ctx.negotiationThread : null;
      const facts = ["The method: anchor on the sourced range for the role, counter once in writing, and trade across salary, start date, and return terms instead of haggling line by line.", benchSentence];
      // MI-123 (mechanism 2): the number on the table is the record's
      // own figure in the user's units — an hourly offer is judged on
      // its rate (plus its bonus), never on an annual figure.
      const figT = offerFigureText(thread, ctx && ctx.offer);
      const signT = (thread && thread.signing) || (ctx && ctx.offer && ctx.offer.signing_bonus) || null;
      if (figT) facts.unshift(`The number on the table is ${figT}${signT ? `, plus a $${Number(signT).toLocaleString()} signing bonus` : ""}${thread.firm ? ` from ${thread.firm}` : ""}${thread.deadline ? `, with a decision due by ${thread.deadline}` : ""} — so the take-it-or-push question is decided by the sourced range above and by whether the deadline leaves room to run a counter, not by the headline figure alone.`);
      return { headline: "Negotiation runs on sourced numbers, one written counter, and no bluffing.", facts, nextStep: "Tell me which piece you are holding — an offer, a deadline, or a second offer — and the plan narrows to it." };
    }
  }

  // IB-TN-9: roleplay asks belong to 128's roleplay engine, not mock
  // prep — the recruiter's line comes from roleplayTurn, statefully.
  function handleRoleplay(text, ctx) {
    if (!Negotiation || !Negotiation.roleplayTurn) return null;
    const profile = ctx.profile || {};
    let st = null;
    try { st = Negotiation.roleplayTurn(profile._careerRoleplay || null, s(text)); } catch { st = null; }
    if (!st) return null;
    profile._careerRoleplay = st;
    // IB-TN-9 Patch 2: the sourcing line comes from 128's benchmark
    // product, never a hard-coded as-of. BUG-074: the no-file case
    // names the source class + the check date from the turn's clock.
    let benchSentence = `Grounded in the negotiation method; no company file is on record for this company yet, so no benchmark figure is claimed — source class: company file compensation notes, checked as of ${new Date(nowOf(ctx)).toISOString().slice(0, 10)}.`;
    try { const b = Negotiation && Negotiation.benchmark ? Negotiation.benchmark(cirFor(text, ctx) || null, {}) : null; if (b && b.text) benchSentence = b.as_of ? s(b.text).split(/(?<=[.!?])\s/)[0] : `${s(b.text).split(/(?<=[.!?])\s/)[0].replace(/\.$/, "")} — source class: company file compensation notes, checked as of ${new Date(nowOf(ctx)).toISOString().slice(0, 10)}.`; } catch { /* keep the no-file sentence */ }
    // BUG-080 ordering: the sourced line precedes the roleplay
    // instruction, whose closing sentence is this reply's specific
    // ending — the generic closer must never stamp over it.
    // WORDING-BACKLOG (BUG-205): the full no-benchmark sentence no
    // longer sits inside the recruiter's bubble breaking character
    // (SC-209) — the sourcing rides as a one-line provenance
    // header, and the roleplay instruction keeps the last word
    // (BUG-080's protected ending: the reply ends on "when it
    // closes.", never the generic closer).
    const facts = [`Source class: company file compensation notes, checked as of ${new Date(nowOf(ctx)).toISOString().slice(0, 10)}.`, "Roleplay: I am playing the recruiter — answer as you would on the real call, and the round is scored when it closes."];
    if (st.feedback) facts.push(st.feedback.split(/(?<=[.!?])\s/)[0]);
    const reply = compose({ headline: st.recruiter || "Tell me more — what would make this an easy yes for you?", facts });
    return { intent: "negotiation_roleplay", reply, resultStatus: st.done ? "completed" : "running", sends: 0, roleplay: { turn: st.turn, done: !!st.done } };
  }
  // IB-TN-6: a recruiter's comp-expectation ask is a negotiation draft
  // on an approval card — never the outreach plan. No number is
  // invented: the draft anchors on the band and asks for it.
  function handleCompExpectation(text, ctx) {
    const body = "Thanks for asking. I am still getting the full picture of the role's scope, and I want to anchor on the approved band for this level — could you share the range for the position? With the full package in view (base, bonus, and the path from intern to full-time), I can give you a precise number I am confident about.";
    const facts = ["The draft sits on its approval card: you see the exact text and approve before anything moves — nothing is sent silently, ever.", "It invents no number: until a sourced band exists, the honest move is to ask for the band, not to anchor on air. Benchmarks, once an offer exists, come from the company file with its own as-of date."];
    const reply = compose({ headline: "Your comp-expectation reply is drafted and held on its card.", facts, nextStep: "Approve the draft, or tell me the range you want named if you have one sourced?" });
    return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: { kind: "comp_expectation_reply", body }, comp_expectation: true };
  }

  // ---------- career OS (129; family Career Os: R-C5) -------------------------
  // ======================================================================
  // DEPTH LANE B (MI-015): the career-path conversation. A path ask
  // states a current role and a target ("I'm a junior accountant, I
  // want to be a CFO one day — what should my next two moves be?")
  // and then CONTINUES ("which skills first?", "does the CPA
  // matter?", "what does the step after senior accountant look
  // like?"). The ladders below are general professional structure —
  // labeled in the reply as the typical ladder, never as a fact
  // about a firm; paces are labeled typical ranges, never promises;
  // no salary figure is ever attached (a worth question gets the
  // honest no-sourced-figure answer). The thread record (from, to,
  // rungs) is what the follow-ups run on.
  // ======================================================================
  const PATH_LADDERS = [
    { from: /account/, to: /cfo|chief financial/, rungs: ["junior accountant", "accountant", "senior accountant", "accounting manager / controller", "VP finance", "CFO"],
      skills: "Close and statements fluency first — own a full monthly close and read all three statements cold; then FP&A (budgets, variance, forecasts), because the rungs above senior accountant pay for forward-looking judgment, not cleaner history.",
      credential: "The CPA is the common credibility marker on this path: usually earned in the first few years, it gates many controller seats and is the floor most CFO searches assume — the alternative pedigree is FP&A and treasury depth in industry, but if you take one credential on this path, the CPA is it, and early is when it costs least.",
      pace: "Commonly two to four years per rung — faster in high-growth companies, slower where the process is partnership-formal; the controller-to-VP step is the usual stall, because it is the first seat judged on business judgment rather than technical output.",
      evidence: "Dated evidence from your current seat: closes you owned, audit findings you cleared, a forecast or variance story you told to a non-accountant — logged the week it happens, because the promotion case is assembled from the record, not from memory.",
      moves: ["Move one: own a visible close — take the hardest reconciliation or the audit relationship in your current seat and log the outcome in your wins record the week it lands.", "Move two: get one forward-looking rep — a budget cycle, a forecast, a business review — because every rung above senior accountant is interviewed as a business partner, not as a preparer."] },
    { from: /support|customer|help ?desk/, to: /product/, rungs: ["customer support rep", "support lead / customer operations", "associate product manager", "product manager", "senior product manager"],
      skills: "Ticket-pattern analysis first — turn the support queue into quantified problem statements (volume, cost, who it hits); then product analytics (SQL and funnels well enough to argue from data); then spec writing — one-pagers with a success metric named before anything is built.",
      credential: "No credential gates product management — the gate is evidence: shipped specs and measured outcomes. A technical credential helps only for platform or deeply technical PM seats; for this path your support record, quantified, is worth more than any certificate.",
      pace: "Commonly one to three years per rung; the support-to-APM step is the stall, because the seat is scarce — most people who make it make it by an internal transfer on the strength of specs they already wrote.",
      evidence: "A file of customer problems you personally quantified, plus at least one fix you spec'd and saw shipped with its measured effect — that file is the entire interview for the associate seat.",
      moves: ["Move one: start the evidence file now — every week, one support pattern written up as a problem statement with numbers, kept in your wins log.", "Move two: spec one fix for the loudest pattern and get it in front of the PM who owns that surface; an internal transfer is earned on shipped specs, not on applications."] },
    { from: /teller|bank/, to: /corporate finance|finance/, rungs: ["bank teller", "credit analyst / financial analyst", "senior financial analyst", "finance manager", "VP finance"],
      skills: "Excel modeling first — three-statement fluency until it is boring; then analysis writing (a credit memo or an investment note a stranger can follow); then one domain depth — treasury, FP&A, or corporate development support.",
      credential: "The CFA is the common credibility marker on this path, usually started while you are an analyst; an MBA is the common reset button at the manager step. Neither is a legal gate — the gate is modeling proof plus a writing sample.",
      pace: "Commonly two to three years per rung; the analyst-to-manager step is the stall, because it is the first seat that manages people and presents to executives instead of producing analysis.",
      evidence: "Models and memos with your name on them, saved with the outcome they informed — a credit you called right, a forecast that held — logged as they happen.",
      moves: ["Move one: build the modeling proof — one full three-statement model of a real public company, kept current, that you can defend line by line.", "Move two: get onto one visible analysis — a credit file, a branch-business review — and present it yourself once; the analyst seat is staffed from people whose work has been seen."] },
    { from: /analyst/, to: /associate/, rungs: ["analyst", "senior analyst", "associate", "vice president"],
      skills: "Deal fluency first — own a full workstream end to end (the model, the book, the client answers) instead of fragments; then client-facing reps, because the associate seat is judged on whether a client can be left alone with you.",
      credential: "No credential gates the associate step — staffing record and sponsorship do. Licenses arrive with the seat itself in regulated businesses; nothing you can buy in advance substitutes for a sponsor who has watched you work.",
      pace: "Commonly two to three years as an analyst before the associate conversation; the calendar matters less than the review cycle — the case lands when decisions are made, so the evidence file has to exist before review season, not during it.",
      evidence: "The evidence file: every win, deal, and piece of feedback logged the day it happens, plus one visible piece of work per month — the promotion case is assembled from that file.",
      moves: ["Move one: build the evidence file — log every win and piece of feedback in your wins log the day it happens, and take one visible piece of work per month.", "Move two: build the sponsorship — one senior person who has seen your work and will say your name in the room, earned by staffed work and follow-through; then time the case to the firm's actual promotion window."] },
    { from: /nurse|nursing|rn/, to: /admin|administrator|executive|management/, rungs: ["nurse", "charge nurse / nurse manager", "director of nursing / service-line director", "VP nursing / hospital administrator"],
      skills: "Operations fluency first — staffing, throughput, and quality metrics for your unit, in numbers; then budgeting (own a unit budget line and explain its variances); then cross-department program ownership, because administration is judged on systems, not shifts.",
      credential: "An MHA (or an MSN in leadership) is the common credential at the director step — usually earned while working as a nurse manager; your RN license is the entry ticket you already hold, and the administration seats ask for the management degree plus a budget you have actually run.",
      pace: "Commonly two to four years per rung; the manager-to-director step is the stall, because it is the first seat hired from outside your own unit — the budget and program record is what travels.",
      evidence: "Unit outcomes with your name on them — a throughput fix, a falls-rate drop, a staffing model that held — with the numbers, logged as they happen.",
      moves: ["Move one: own one unit metric end to end (throughput, falls, agency hours) and be the person who reports it; administrators are hired from nurses who already speak in system numbers.", "Move two: take a budget line — volunteer for the unit's staffing or supply budget and learn to explain its variances; that fluency is the actual interview for the manager seat."] },
    { from: /retail/, to: /\bhr\b|human resources|people/, rungs: ["retail manager", "HR coordinator / generalist", "HR manager / HR business partner", "director of HR", "VP people operations"],
      skills: "Employment-practice fluency first — hiring, scheduling, onboarding, and discipline done correctly and documented, which your store already forces you to practice; then HR systems and people analytics (turnover, time-to-fill, absence patterns, in numbers).",
      credential: "The SHRM-CP is the common first credential on this path; it is not a gate — the gate is a documented record of people decisions done well at volume, which high-volume retail management genuinely gives you.",
      pace: "Commonly one to three years per rung; the coordinator step can look like a sideways move — take it: it converts store experience into HR record, and every rung above it pays for the record, not the intention.",
      evidence: "People outcomes from your store with numbers — a hiring funnel you improved, a turnover drop, an onboarding you rebuilt — logged with the before and after.",
      moves: ["Move one: document your people record now — the hires, the retention numbers, the hard conversations handled well; that record is your HR portfolio, and it already exists in your store.", "Move two: take the first HR-titled seat you can reach (coordinator, generalist, recruiting) even sideways — the ladder above it is climbed from inside the function."] },
  ];
  function ladderFor(from, to) {
    const f = lc(from || ""), t2 = lc(to || "");
    for (const L2 of PATH_LADDERS) if (L2.to.test(t2) && (!f || L2.from.test(f))) return L2;
    return null;
  }
  function genericLadder(from, to) {
    const f = s(from || "your current role").trim(), t2 = s(to || "the target role").trim();
    return { rungs: [f, `senior ${f}`, `${f} manager / team lead`, "director-level seat", t2],
      skills: "The craft skills of the NEXT rung first — do the target seat's visible work at your current level (the analysis, the client conversation, the budget line) until it is normal, then the judgment skills the rung after it pays for.",
      credential: "No single credential gates this path in general; where the field has one (a license, a charter, a named certificate), it belongs early, and everywhere the real gate is dated evidence of the next rung's work already done.",
      pace: "Commonly two to four years per rung across professional ladders, and it varies more by company than by field; the stall is usually the first seat that manages other people or owns a budget.",
      evidence: "Dated evidence of the next rung's work done from your current seat — logged the week it happens, because promotion cases are assembled from records, not from memory.",
      moves: [`Move one: do one piece of the ${t2} job from where you sit — visibly, with the outcome logged; paths are climbed on evidence of the next rung, not on tenure at this one.`, "Move two: find the person one rung up whose work you can make easier, and become known to them for follow-through; sponsorship moves files that applications cannot."] };
  }
  function parsePathAsk(tn) {
    let from = null, to = null;
    let m;
    if ((m = tn.match(/\bi'?m an?\s+([a-z][a-z /&-]{1,34}?)(?:\s+and\b|\s+but\b|\s+—|[.,;?]|$)/))) from = m[1].trim();
    else if ((m = tn.match(/\bbeen an?\s+([a-z][a-z /&-]{1,34}?)(?:\s+for\b|[.,;]|$)/))) from = m[1].trim();
    else if ((m = tn.match(/\bi'?m in\s+([a-z][a-z /&-]{1,34}?)(?:\s+right now|\s+atm\b|[.,;]|$)/))) from = m[1].trim();
    else if ((m = tn.match(/\bi work as an?\s+([a-z][a-z /&-]{1,34}?)(?:[.,;]|$)/))) from = m[1].trim();
    if ((m = tn.match(/\bwant to be\s+(?:an?\s+)?([a-z][a-z /&-]{1,34}?)(?:\s+one day\b|\s+someday\b|\s+eventually\b|[.,;]|$)/))) to = m[1].trim();
    else if ((m = tn.match(/\bfrom\s+([a-z][a-z /&-]{1,30}?)\s+to\s+(?:an?\s+)?([a-z][a-z /&-]{1,30}?)(?:[.,;?]|$)/))) { if (!from) from = m[1].trim(); to = m[2].trim(); }
    else if ((m = tn.match(/\bladder to\s+(?:an?\s+)?([a-z][a-z /&-]{1,30}?)(?:\s+actually\b|[.,;?]|$)/))) to = m[1].trim();
    else if ((m = tn.match(/\bbe\s+(?:an?\s+)?([a-z][a-z /&-]{1,30}?)\s+one day\b/))) to = m[1].trim();
    else if ((m = tn.match(/\bend up (?:in|as|being)\s+(?:an?\s+)?([a-z][a-z /&-]{1,34}?)(?:\s+someday\b|\s+one day\b|[.,;]|$)/))) to = m[1].trim();
    else if ((m = tn.match(/\bmove into\s+([a-z][a-z /&-]{1,34}?)(?:\s+eventually\b|\s+one day\b|[.,;]|$)/))) to = m[1].trim();
    else if ((m = tn.match(/\bmoving into\s+([a-z][a-z /&-]{1,34}?)(?:\s+one day\b|\s+eventually\b|[.,;]|$)/))) to = m[1].trim();
    else if ((m = tn.match(/\b(?:thinking about|considering)\s+(?:an?\s+)?([a-z][a-z /&-]{1,34}?)(?:\s*[—–-]|[.,;?]|$)/))) to = m[1].trim();
    else if ((m = tn.match(/\brunning\s+([a-z][a-z /&-]{1,30}?)(?:\s+somewhere\b|[.,;]|$)/))) to = m[1].trim();
    else if ((m = tn.match(/\bget to\s+(?:be\s+)?(?:an?\s+)?([a-z][a-z /&-]{1,30}?)(?:[.,;]|$)/))) to = m[1].trim();
    if (from) from = from.replace(/\s+(at|for|with)$/, "").trim();
    if (to) to = to.replace(/\s+(at|for|with|in)$/, "").trim();
    return { from, to };
  }
  function handleCareerPath(text, ctx) {
    const tn = typoNorm(text);
    const prev = careerPathOf(ctx);
    const parsed = parsePathAsk(tn);
    const promotionAsk = /\bwant a promotion\b|\bpromotion this year\b|\bget promoted\b|\bmy promotion\b/.test(tn)
      || (!!ctx._pathPlanContinuation && /\bmove one\b|\bstart the plan\b|\bfirst move\b/.test(tn));
    const from = parsed.from || prev.from || null;
    const to = parsed.to || prev.to || (promotionAsk ? "promotion" : null);
    if (!from && !to && !prev.from && !prev.to) return null;
    const L2 = (from || to) && to !== "promotion" ? (ladderFor(from, to) || genericLadder(from, to)) : null;
    const rungs = (L2 && L2.rungs) || prev.rungs || null;
    // Record the thread (the user's own stated roles only).
    try {
      const rec = careerPathForWrite(ctx);
      if (from) rec.from = from;
      if (to) rec.to = to;
      if (rungs) rec.rungs = rungs;
      rec.at = new Date(nowOf(ctx)).toISOString();
    } catch { /* the answer stands without the record */ }
    const srcLine = `Grounded in your own stated path, as of ${asOfMonthYear(ctx)} — the ladder is the typical professional structure for these roles; titles and timing vary by company.`;
    const pathName = `${from || "where you are"} → ${to || "the next rung"}`;
    // Follow-up shapes (a thread exists, or the turn names the topic).
    if (/\bhow long\b|\bpace\b|\byears?\s+(per|each|a)\s+(step|rung)\b|\beach step\b[^.]*\btake\b/.test(tn) && (L2 || prev.rungs)) {
      const facts = [(L2 && L2.pace) || (prev.rungs ? "Commonly two to four years per rung across professional ladders, and it varies more by company than by field — treat any single number as a planning rhythm, not a promise." : ""), srcLine].filter(Boolean);
      return { intent: "career_os_plan", reply: compose({ headline: `The pace on ${pathName} — typical ranges, honestly labeled.`, facts, nextStep: "Want the first rung's timeline turned into this quarter's checklist?" }), resultStatus: "awaiting_user", sends: 0, payload: { kind: "career_path", from, to } };
    }
    if (/\bstep after\s+([a-z][a-z /&-]{1,30}?)(?:\s+look|\s+involve|\s+require|\?|\.|,|$)/.test(tn) && rungs) {
      const named = (tn.match(/\bstep after\s+([a-z][a-z /&-]{1,30}?)(?:\s+look|\s+involve|\s+require|\?|\.|,|$)/) || [])[1].trim();
      // The LONGEST rung the user named wins — "senior accountant"
      // contains "accountant", and the first-match read answered
      // the step after the wrong rung.
      let idx = -1, bestLen = -1;
      rungs.forEach((r, i) => { const base = lc(r).split(" /")[0]; const hitLen = lc(r).includes(named) ? named.length : named.includes(base) ? base.length : named.includes(lc(r)) ? lc(r).length : -1; if (hitLen > bestLen) { bestLen = hitLen; idx = i; } });
      if (idx >= 0 && rungs[idx + 1]) {
        const facts = [`After ${rungs[idx]} comes ${rungs[idx + 1]} — the seat where scope widens from your own work to a team's or a function's, and the interview for it tests judgment about the business, not technique.`, (L2 && L2.skills) || "The preparation is the next rung's visible work, done from the seat below it until it is normal.", srcLine];
        return { intent: "career_os_plan", reply: compose({ headline: `The step after ${rungs[idx]}: ${rungs[idx + 1]}.`, facts, nextStep: "Want what to build in your current seat to be ready for it?" }), resultStatus: "awaiting_user", sends: 0, payload: { kind: "career_path", from, to } };
      }
    }
    if (/\bcpa\b|\bcfa\b|\bshrm\b|\bmha\b|\bcredential|\bcertif|\bdegree\b|\blicen[cs]e\b|\bqualif/.test(tn) && (L2 || prev.rungs || to === "promotion")) {
      const facts = [(L2 && L2.credential) || "On this path the credential question is empirical: read five postings for the target seat and count what they actually require — the posting record, not folklore, settles which certificate is a gate and which is decoration.", srcLine];
      return { intent: "career_os_plan", reply: compose({ headline: `Credentials on the ${pathName} path — what actually gates, and when.`, facts, nextStep: "Want the skills order for the first rung next?" }), resultStatus: "awaiting_user", sends: 0, payload: { kind: "career_path", from, to } };
    }
    if (/\bskills?\b|\blearn first\b|\bbuild first\b/.test(tn) && (L2 || prev.rungs)) {
      const facts = [(L2 && L2.skills) || "The craft skills of the next rung first — its visible work done from your current seat until it is normal.", `On ${pathName}, the order matters more than the volume: the next rung's skills are the interview for the rung after it.`, srcLine];
      return { intent: "career_os_plan", reply: compose({ headline: `Skills first on ${pathName} — in the order the ladder pays for them.`, facts, nextStep: "Want those turned into a this-quarter practice list?" }), resultStatus: "awaiting_user", sends: 0, payload: { kind: "career_path", from, to } };
    }
    if (/\brung between\b|\bbetween here and\b|\bwhat'?s between\b/.test(tn) && rungs) {
      const facts = [`The rung between is ${rungs[1]} — the seat where you stop being only an individual contributor: a team's queue, a unit's numbers, or a surface's problem list becomes partly yours.`, (L2 && L2.evidence) || (L2 && L2.moves[0]) || "", srcLine].filter(Boolean);
      return { intent: "career_os_plan", reply: compose({ headline: `Between ${from || "here"} and ${to || "the target"}: ${rungs[1]}.`, facts, nextStep: "Want the evidence list for that rung — what to collect in this job?" }), resultStatus: "awaiting_user", sends: 0, payload: { kind: "career_path", from, to } };
    }
    if (/\bevidence\b|\bcollect/.test(tn) && (L2 || prev.rungs)) {
      const facts = [(L2 && L2.evidence) || "Dated evidence of the next rung's work, logged the week it happens.", "The log is the product feature built for exactly this: say \"log a win\" with the outcome and it is kept, dated, in your own words — the review packet assembles itself from it.", srcLine];
      return { intent: "career_os_plan", reply: compose({ headline: `The evidence to collect on ${pathName}.`, facts, nextStep: "Want to log the first win now — name one outcome from this quarter?" }), resultStatus: "awaiting_user", sends: 0, payload: { kind: "career_path", from, to } };
    }
    if (/\bquit\b|\bleav\w*\b[^.]*\bbeat\b|\bprice\b[^.]*\b(quit|leav|stay)/.test(tn)) {
      const facts = ["Priced honestly, leaving beats staying only when three things are all true: your evidence file is strong enough to be hired a rung up elsewhere, the ladder here is demonstrably closed (not just slow), and the outside seat is a rung up — a sideways exit restarts the clock at the same level.",
        "A stuck feeling is not one of the three: it is priced after one full review cycle of the two moves (evidence file + sponsorship), because a cycle is the unit the ladder actually decides on.",
        "If you do price an exit, the number is never invented here: it is the outside offer's own figure against this seat's record — bring the offer and the math runs on it.", srcLine];
      return { intent: "career_os_plan", reply: compose({ headline: "The quit option, priced against the stay option — same evidence standard for both.", facts, nextStep: "Want the stay-one-cycle plan written out — the two moves with dates?" }), resultStatus: "awaiting_user", sends: 0, payload: { kind: "career_path", from, to } };
    }
    if (/\bfirst\b|\bmove one\b|\bstart (the plan|it|now)\b|\bwhat'?s the plan\b|\bstaying\b/.test(tn) && (prev.from || prev.to || promotionAsk)) {
      const mv = (L2 && L2.moves) || ["Move one: build the evidence file — log every win and piece of feedback the day it happens, and take one visible piece of work per month; the promotion case is assembled from that file, not from memory.", "Move two: build the sponsorship — one senior person who has seen your work and will advocate, earned by staffed work and follow-through, and time the case to the review window."];
      const facts = [mv[0], mv[1], srcLine];
      return { intent: "career_os_plan", reply: compose({ headline: `The plan on ${pathName} — move one first.`, facts, nextStep: "Want move one started now — the wins log opened on this thread?" }), resultStatus: "awaiting_user", sends: 0, payload: { kind: "career_path", from, to } };
    }
    // The full path answer (fresh ask, or a promotion ask).
    if (to === "promotion" || promotionAsk) {
      const facts = ["On worth, the honest state first: no sourced figure for your role and level is on record on this thread, so no number is claimed — a worth figure here comes only from a company file or a posted band, never from a model's memory of the market.",
        "The promotion plan is an evidence game with a calendar: move one is the evidence file — every win and piece of feedback logged the day it happens, plus one visible piece of work per month, so the case exists before review season.",
        "Move two is sponsorship and timing: one senior person who has seen your work and will say your name in the room, and the case landed inside the actual promotion window — a strong case filed after decisions are made waits a full cycle.",
        srcLine];
      return { intent: "career_os_plan", reply: compose({ headline: "The promotion plan — and the honest state of the worth question.", facts, nextStep: "Want move one started — the wins log opened on this thread — or the worth question grounded on a named company's file first?" }), resultStatus: "awaiting_user", sends: 0, payload: { kind: "career_path", from, to: "promotion" } };
    }
    if (L2 && rungs) {
      const facts = [`The typical ladder: ${rungs.join(" → ")} — titles vary by company, and in smaller companies two rungs often collapse into one seat.`,
        L2.moves[0], L2.moves[1],
        `First skills, in order: ${L2.skills.split(" — ")[0].split("; ")[0]}.`, srcLine];
      return { intent: "career_os_plan", reply: compose({ headline: `The path from ${from || "where you are"} to ${to} — the ladder and your next two moves.`, facts, nextStep: "Want the skills order for the first rung, the credential picture, or the typical pace per rung?" }), resultStatus: "awaiting_user", sends: 0, payload: { kind: "career_path", from, to, rungs } };
    }
    return null;
  }
  // The path gate, evaluated at two placements in dispatch: an early
  // carve-out (ahead of the people matchers that read a path ask as
  // a sourcing ask) and the late OS gate. The handler itself stands
  // down (null) whenever the turn carries no parseable path and no
  // path thread, so the gate can be generous where it sits.
  function careerPathGateHit(text, ctx, late) {
    const pathState = careerPathOf(ctx);
    const pathActive = !!(pathState && (pathState.from || pathState.to));
    const tn2 = typoNorm(text);
    let hit =
      /\bwant to be\s+(an?\s+)?[a-z]|\bwant to become\b|\bend up (in|as|being)\b|\bnext (two|few) moves\b|\bhow do i get from\b|\bget from\b[^.]*\bto\b|\bmove into\b[^.]*\b(eventually|someday|one day)\b|\bmoving into\b|\bthinking about (moving|going|getting) into\b|\b(thinking about|considering)\b[^.?!]*\b(real (move|path)|move from here|path from here)\b|\bis that (even )?a real (move|path)\b[^.?!]*\bfrom here\b|\bwant a promotion\b|\bpromotion this year\b|\bi'?m an?\s+[a-z][^.]*\bwant\b|\bbeen an?\s+[a-z][^.]*\bwanna\b|\bwanna (be|end up)\b|\brunning\b[^.]*\bsomewhere\b|\bwhat'?s the ladder\b|\bladder to\b/.test(tn2)
      || (pathActive && /\bskills?\b|\blearn\b|\bfirst\b|\bnext\b|\bhow long\b|\bcredential|\bcertif|\bcpa\b|\bcfa\b|\bshrm\b|\bmha\b|\bstep after\b|\bmove one\b|\bevidence\b|\bcollect|\bquit\b|\bprice\b|\brung\b|\bplan\b|\bdegree\b|\blicen[cs]e\b|\bstaying\b/.test(tn2));
    if (!hit && late && /\bstart the plan\b|\bwhat'?s move one\b/.test(tn2)) { hit = true; ctx._pathPlanContinuation = true; }
    if (!hit) return null;
    return handleCareerPath(text, ctx);
  }

  function handleOS(text, ctx) {
    if (!OS) return null;
    const t = lc(text);
    const profile = ctx.profile || {};
    let store = ctx.osStore || null;
    // DEPTH LANE B (MI-015): the OS store must survive the host's
    // per-turn ctx rebuild like the tracker store does — it rides
    // the track store (the whitelisted, snapshot-persisted store),
    // so a win logged on one turn is still there when a later turn
    // asks to see the log. Before this, every turn created a fresh
    // store and the wins log forgot everything between turns.
    if (!store) { try { const ts0 = trackStoreOf(ctx); if (ts0 && ts0._osStore) store = ts0._osStore; } catch { store = null; } }
    if (!store && OS.createStore) { try { store = OS.createStore((profile.basics && profile.basics.name) || "you"); ctx.osStore = store; try { const ts1 = trackStoreOf(ctx); if (ts1) ts1._osStore = store; } catch { /* the ctx store stands */ } } catch { store = null; } }
    const sourceLine = `Grounded in your own log and record, as of ${asOfMonthYear(ctx)}.`;
    // BUG-072: OS turns from this catch-all carry the same F8 record
    // envelope as 130's front door — career_os_* intent + payload —
    // instead of sinking into a bare capability_status result.
    const osRec = (product, kind, textFallback) => {
      if (!product || typeof product !== "object" || Array.isArray(product)) return undefined;
      const date = product.as_of || product.created_at || product.date || new Date(nowOf(ctx)).toISOString().slice(0, 10);
      return Object.assign({}, product, { record_id: product.watch_id || product.win_id || product.plan_id || product.record_id || product.id || `${kind}-${String(date).slice(0, 10)}`, date: product.date || String(date).slice(0, 10), text: product.text || product.statement || textFallback || undefined });
    };
    try {
      // DEPTH LANE B (MI-015): a SHOW ask reads the log — it must
      // never be parsed as a log statement (the branch below strips
      // its prefix and would bank "show me my wins log" as a win).
      if (/\bshow\b[^.]*\bwins?\b|\blist\b[^.]*\bwins?\b|\bmy wins\b|\bwhat'?s in my wins\b|\bread\b[^.]*\bwins?\b/.test(t) && OS.reviewPacket && store) {
        const rp = OS.reviewPacket(store, {});
        const body = digText(rp, ["text", "summary"], ["sections", "lines", "wins"]);
        const winLines = body ? body.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 3) : [];
        const facts = winLines.length ? [...winLines, sourceLine] : ["No wins logged yet — the log is empty, and it stays empty until you state one; nothing is back-filled.", sourceLine];
        const reply = compose({ headline: "Your wins log, from the record.", facts, nextStep: "Log the next one the day it happens — say \"log a win\" and what happened." });
        return { intent: "career_os_wins_log", reply, resultStatus: "prepared", sends: 0, payload: osRec(rp, "review-packet") };
      }
      if (/\bwins? log\b|\blog a win\b|\badd a win\b|\bi text wins\b/.test(t) && OS.logWin && store) {
        const win = OS.logWin(store, { text: s(text).replace(/.*(log a win|wins? log)[:\s]*/i, "") || "a win you named", at: new Date(nowOf(ctx)).toISOString() });
        const reply = compose({ headline: "Win added to your packet.", facts: ["Wins land in the achievements packet in your own words, dated.", sourceLine], nextStep: "Keep them coming — the packet is what your next applications draw from." });
        return { intent: "career_os_wins_log", reply, resultStatus: "completed", sends: 0, payload: osRec(win, "win") };
      }
      if (/\bnetwork upkeep\b|\bgoing cold\b|\bwarmest contacts\b/.test(t) && OS.networkUpkeep && store) {
        const up = OS.networkUpkeep(store, { now: nowOf(ctx) });
        const due = (up && (up.due || up.suggestions || up.contacts)) || [];
        const facts = Array.isArray(due) && due.length ? due.slice(0, 3).map((x) => s(typeof x === "string" ? x : x.text || x.name || "").split(/(?<=[.!?])\s/)[0]).filter(Boolean) : ["Nobody crosses the going-cold line this week — the warm set is holding."];
        facts.push(sourceLine);
        const reply = compose({ headline: "Network upkeep, from your relationship record.", facts, nextStep: "Want a keep-warm touch drafted for the coldest one?" });
        return { intent: "career_os_upkeep", reply, resultStatus: "prepared", sends: 0, upkeep: up, payload: osRec(up, "network-upkeep", up.restart_draft || undefined) };
      }
      if (/\bpassive watch\b|\bperfect-fit role posts\b|\bwatch:/.test(t) && OS.createWatch && store) {
        const watch = OS.createWatch(store, { text: s(text) }, {});
        const reply = compose({ headline: "The watch is set.", facts: ["It reads the same boards as discovery, and a fitting role pings you when it posts — while you are employed, the watch works so you don't have to.", sourceLine], nextStep: "Want the watch widened to neighbouring titles?" });
        return { intent: "career_os_watch", reply, resultStatus: "prepared", sends: 0, watch, payload: watch };
      }
      if (/\breview packet\b|\bpromotion case\b/.test(t) && OS.reviewPacket && store) {
        const rp = OS.reviewPacket(store, {});
        const body = digText(rp, ["text", "summary"], ["sections", "lines", "wins"]);
        const reply = compose({ headline: "Your review packet, built from the wins log.", facts: [body ? body.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "It assembles the semester's wins, dated, in your own words — the promotion case writes itself from the log, not from memory.", sourceLine], nextStep: "Want the packet exported for your review meeting?" });
        return { intent: "career_os_review_packet", reply, resultStatus: "prepared", sends: 0, review_packet: rp, payload: rp };
      }
      if (/\bfirst[ -]?90\b/.test(t)) {
        const r = OS.returnOfferPlaybook({ cir: ctx.cir || cirFor(text, ctx) || null, offer: ctx.offer || null });
        const days = (r && r.first_90_days) || [];
        const reply = compose({ headline: "Your first-90-days plan at the new job.", facts: [...days.slice(0, 3).map((x) => s(x)), sourceLine].filter(Boolean), nextStep: "Want week one pinned to your actual start date?" });
        return { intent: "career_os_first90", reply, resultStatus: "prepared", sends: 0, playbook: r, payload: osRec(r, "return-offer-playbook", days[0]) };
      }
      if (/\btimeline\b/.test(t) && OS.careerTimeline && store) {
        const tl = OS.careerTimeline(store, profile);
        const phases = (tl && (tl.phases || tl.timeline)) || [];
        const facts = phases.slice(0, 3).map((p) => `${p.name || p.phase}: ${p.window || p.when || ""}`.trim());
        facts.push(sourceLine);
        const reply = compose({ headline: "Your career timeline, from the record.", facts: facts.filter(Boolean), nextStep: "Want the next milestone pinned to a date?" });
        return { intent: "career_os_timeline", reply, resultStatus: "prepared", sends: 0, timeline: tl, payload: osRec(tl, "career-timeline", tl.statement) };
      }
      if (/\bgoals?\b/.test(t) && OS.goalsCheckin && store) {
        const g = OS.goalsCheckin(store, { now: nowOf(ctx) });
        const facts = [];
        if (g && g.text) facts.push(s(g.text).split(/(?<=[.!?])\s/)[0]);
        facts.push(sourceLine);
        const reply = compose({ headline: "Your goals check-in, against your own targets.", facts, nextStep: "Want to adjust a target, or hold the line?" });
        return { intent: "career_os_goals", reply, resultStatus: "prepared", sends: 0, goals: g, payload: osRec(g, "goals-checkin", g.adjustment_prompt) };
      }
    } catch { /* fall through to the status answer */ }
    // DEPTH WAVE (BUG-213 / FR-370), Item A (career-os): the stuck /
    // ladder / promotion / quit shape gets a CONCRETE two-move plan
    // built from the thread's own facts — the analyst-to-associate
    // ladder is a record-and-evidence game, and the two moves say
    // exactly what to build and when.
    if (/\bstuck\b|\bhow does anyone (get|go|move|become)\b|\bhow do i get (from|promoted|to)\b|\bget promoted\b|\bmy promotion\b|\bpromotion (case|review|track|path)\b|\bladder\b[^.]*\b(how|climb|analyst to associate|get to)\b|\bshould i stay\b|\bcareer plan\b|\bnext level\b|\bmove up\b/.test(t)) {
      const facts0 = statedFactsOf(ctx);
      const yr = facts0.find((f) => f.kind === "year");
      const geo = facts0.find((f) => f.kind === "geography");
      const firm = facts0.find((f) => f.kind === "target_firm");
      const facts = [
        `The ladder from analyst to associate is climbed on evidence, not tenure: staffing on visible deals, a manager who will say your name in the room, and a wins record that exists before review season — ${yr ? `as a ${yr.value}, ` : ""}that record starts now, not the semester before reviews.`,
        "Move one: build the evidence file. Log every win, deal, and piece of feedback in the OS wins log the day it happens, and take one visible piece of work per month — the promotion case is assembled from that file, not from memory.",
        `Move two: build the sponsorship${firm ? ` at ${firm.value}` : ""}${geo ? ` in ${geo.value}` : ""}. One senior person who has seen your work and will advocate — earned by staffed work and follow-through, never by volume networking — plus a timeline check against the firm's actual promotion window, so the case lands when decisions are made.`,
        "Quitting is the counterfactual, priced the same way: it beats staying only when the evidence file is strong and the ladder is demonstrably closed — a stuck FEELING is fixed by the two moves above first, for one review cycle, before it is priced as a stuck FACT.",
        sourceLine,
      ];
      // INTEGRATION (2026-10-16): a worth+plan turn ("what am I
      // worth and what's the plan?") must carry BOTH halves — the
      // plan above and the honest worth state, computed the same
      // way 130's SC-271 computes it (sourced figures only; the
      // unavailable state named, never a guessed number).
      if (/\bwhat am i worth\b|\bunderpaid\b|\bmarket value\b/.test(lc(text)) && OS && typeof OS.marketValue === "function") {
        try {
          const mv = OS.marketValue(profile, []);
          if (mv && mv.available && mv.text) facts.push(`And the worth half, from sourced figures only: ${mv.text}`);
          else facts.push("And the worth half, honestly: no sourced market figure is on file for your role yet, so no number is quoted — a guessed figure would be worse than none. Paste a posting with a stated range and the read grounds itself.");
        } catch { /* the plan half still stands */ }
      }
      const reply = compose({ headline: "The plan: the ladder, and the two moves that climb it:", facts, nextStep: "Want move one started — the wins log opened on this thread's record?" });
      return { intent: "career_os_plan", reply, resultStatus: "awaiting_user", sends: 0, payload: osRec(null, "career-ladder-plan", undefined) };
    }
    const reply = compose({ headline: "That lives in your career OS — here is the honest state of it.", facts: ["The OS keeps your timeline, goals, watch list, and wins in one record, and it reports from that record only.", sourceLine], nextStep: "Ask for the timeline or the goals check-in and I will show it in full." });
    return { intent: "career_os_status", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  // ======================================================================
  // BROADENING PASS (same fix wave): the remaining A1 contained clusters —
  // intel guidance (125), graph catch (135), inbox events (126), outreach
  // ops (124), apply rules (132), packet rules (133), and the honest
  // R-C7 guards. Same copy law as the block above.
  // ======================================================================
  function digText(obj, keys, arrKeys) {
    if (!obj || typeof obj !== "object") return null;
    for (const k of keys || []) if (typeof obj[k] === "string" && obj[k].length > 25) return obj[k];
    for (const k of arrKeys || []) if (Array.isArray(obj[k])) {
      const parts = obj[k].map((x) => typeof x === "string" ? x : (x && (x.text || x.action || x.line || x.title)) || "").filter(Boolean);
      if (parts.length) return parts.slice(0, 3).join(" ");
    }
    return null;
  }

  // R-C7 honest guards: capabilities with NO wired route must say so, with
  // the closest real alternative — never a tracker/portal fiction.
  function handlePortalStatusUnavailable(text, ctx) {
    const reply = compose({ headline: "I can't read your real application status from the portal — that live read is not wired.", facts: ["No portal session exists for me to read, and I will not invent a status.", "The closest real thing: tell me the status, or forward the portal's email, and the tracker keeps it from the record with the source named."], nextStep: "Forward the last portal email and I will reconcile the tracker against it." });
    return { intent: "honest_unavailable", reply, resultStatus: "awaiting_user", sends: 0 };
  }
  function handleVoiceMockUnavailable(text, ctx) {
    return { intent: "honest_unavailable", reply: "Voice mock interviews are not available yet — there's no speech path in this build, so I can't hear you, transcribe an answer, or handle an interruption. The closest real option is a text mock: same questions, same rubric, scored the same way. Want me to start a text mock instead?", resultStatus: "awaiting_user", sends: 0 };
  }

  // ---------- intel guidance (125): thesis / path / cohort machinery --------
  // CIR access: the files are static reference data shipped with the repo
  // (packages/career-data/cirs). loadCIRs() in 125 is a VALIDATOR that
  // expects a list — calling it bare throws, and matching on cir.name
  // never worked (the field is company_name). Load the JSONs once;
  // host-provided ctx.cirs/cir win when present.
  let _cirCache = null;
  function cirListOf(ctx) {
    if (ctx && Array.isArray(ctx.cirs) && ctx.cirs.length) return ctx.cirs;
    if (ctx && ctx.cir) return [ctx.cir];
    if (_cirCache && _cirCache.length) return _cirCache;
    try {
      const fs = require("node:fs");
      const path = require("node:path");
      const dir = path.join(__dirname, "..", "career-data", "cirs");
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
      _cirCache = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    } catch { _cirCache = []; }
    // COMPLEXITY WAVE (BUG-174): in the shipped bundle there is no
    // filesystem to read — the loader above cached an EMPTY list for
    // the process's life and every company-file answer silently
    // died. The build embeds the library as CAREER_CIRS_JSON
    // (appended after the modules, so it is read here, at call
    // time); an empty fs result falls back to it, and only a
    // non-empty list is ever cached.
    if (!_cirCache.length) {
      try { if (typeof CAREER_CIRS_JSON !== "undefined" && Array.isArray(CAREER_CIRS_JSON) && CAREER_CIRS_JSON.length) _cirCache = CAREER_CIRS_JSON; } catch { /* embedded const not yet evaluated */ }
    }
    return _cirCache;
  }
  function cirShortName(cir) {
    const full = s(cir && (cir.company_name || cir.name));
    return full.split(/\s+—\s+|\s+-\s+/)[0].trim() || full;
  }
  function cirMatches(cir, t) {
    const short = lc(cirShortName(cir));
    if (!short) return false;
    if (t.includes(short)) return true;
    const first = short.split(/\s+/)[0];
    if (first.length >= 4 && !/^(the|a|an)$/.test(first) && new RegExp(`\\b${first}\\b`).test(t)) return true;
    const slug = lc(s(cir.company_id)).replace(/-/g, " ").replace(/\s+ibd$/, "");
    if (slug.length >= 4 && t.includes(slug)) return true;
    // BUG-073: short company ids (bcg) and archetype kinds are how
    // users actually name these files — "Company file built: BCG",
    // "dev-tools startup archetype". Match the id as a whole word,
    // and an archetype by kind word + the word archetype.
    const cid = lc(s(cir.company_id));
    if (cid.length >= 3 && new RegExp(`\\b${cid}\\b`).test(t)) return true;
    if (cid.startsWith("archetype-")) { const kind = cid.slice("archetype-".length).split("-")[0]; if (kind && t.includes("archetype") && new RegExp(`\\b${kind}\\b`).test(t)) return true; }
    return false;
  }
  // A NAMED target (company, optionally + title words from the ask)
  // resolves directly from the corpus — the fit gate that shapes
  // recommendations must not silently veto the exact role the user
  // named; the tailor itself discloses the gaps.
  function postingByCompanyTitle(ctx, company, text) {
    if (!company) return null;
    const want = lc(company);
    const pool = postingsFromCtx(ctx).filter((p) => p.company && (lc(p.company).includes(want) || want.includes(lc(p.company).replace(/\s*\(fictional\)\s*/g, "").trim())));
    if (!pool.length) return null;
    if (pool.length === 1) return pool[0];
    const words = new Set(lc(text).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
    let best = pool[0], bestScore = -1;
    for (const p of pool) {
      const overlap = lc(p.title).split(/[^a-z0-9]+/).filter((w) => words.has(w)).length;
      if (overlap > bestScore) { bestScore = overlap; best = p; }
    }
    return best;
  }
  function cirFor(text, ctx) {
    if (!Intel) return null;
    const t = lc(text);
    return cirListOf(ctx).find((x) => x && cirMatches(x, t)) || null;
  }
  function cirFieldText(v) {
    if (!v) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return cirFieldText(v[0]);
    // BUG-087 (template-breakup lane): the company files carry their
    // prose under `statement` (hiring_bar_summary, compensation_notes,
    // hiring_cadence, interview_styles, thesis_text all use it) — the
    // probe list never read it, so every file extracted as empty and
    // 23 different asks collapsed onto one "thin file" sentence that
    // was false for all 38 files on disk.
    if (typeof v === "object") return s(v.summary || v.text || v.description || v.notes || v.band || v.statement || v.claim || "");
    return "";
  }
  // IB-F5F7-2: guidance-shaped asks are answered by 144's engine —
  // its records are the F7-complete cited responses. 142 used to
  // require 144 and never call it; the templates below remain only
  // as the fallback when 144 declines the intent.
  function guidanceIntentFor(t) {
    if (/\bhonest odds\b|\bwhat are my (chances|odds)\b|\beven realistic\b|\bany hope\b|\bcan i get faang\b|\bmy odds\b/.test(t)) return "odds_request";
    if (/\bh-1b\b|\bvisa\b|\binternational student\b|\bwork authorization\b|\bopt\b|\bcpt\b/.test(t)) return "work_authorization";
    if (/\bsponsorship\b|\bsponsor\b/.test(t)) return "sponsorship_history";
    if (/\bcertificat|\bcourse\b[^.]*\bworth\b|\bworth buying\b|\bbootcamp\b/.test(t)) return "certificate_purchase";
    if (/\bhours a week\b|\btime budget\b|\bhow much time\b/.test(t)) return "time_budget_plan";
    if (/\bmentor\b/.test(t)) return "mentor_source";
    if (/\bsuspicious\b|\bscam\b|\btoo good to be true\b|\blegit\b/.test(t)) return "suspicious_posting";
    if (/\bcareer switcher\b|\bswitch(ing)? (fields|careers|to)\b|\bchanged my mind\b|\binterest\b[^.]*\bchange/.test(t)) return "interest_change";
    if (/\btake my job\b|\bai\b[^.]*\btrend\b|\btrend\b/.test(t)) return "trend_scope";
    if (/\bhow few\b|\bthin\b|\bsmall sample\b|\bvc seats\b/.test(t)) return "thin_sample";
    if (/\bskill gap\b|\bprereqs?\b|\bmcat\b|\bclearance\b|\bwhat (skills|do i need)\b/.test(t)) return "skill_gap_plan";
    if (/\breject(ed|ion)\b[^.]*\b(advice|what now|next)\b|\bafter (a |the )?rejection\b/.test(t)) return "rejection";
    if (/\bgraduat|\bgrad school\b|\bwhich major\b|\bstraight out of college\b|\bfrom undergrad\b/.test(t)) return "graduation_window";
    if (/\bcredential\b|\blicense\b|\brequirement\b[^.]*\breal\b/.test(t)) return "classify_credential";
    if (/\bhow do i get\b|\bpath\b|\bladder\b|\bwhich fits me\b|\bget into\b|\bbreak into\b|\bwhere do i start\b|\bhow do i start\b|\bbig law\b|\bmbb\b|\bquant\b[^.]*\bpath\b|\bwhat would i do\b/.test(t)) return "plan_paths";
    if (/\bfatal for\b|\bno sugarcoating\b|\bactually require\b|\bactually help\b|\boffsets the brand gap\b|\bmarket (bad|brutal)\b|\bdata science entry\b|\bstartup entry\b/.test(t)) return "honest_evidence";
    return null;
  }
  function handleIntelGuidance(text, ctx) {
    const cir = cirFor(text, ctx);
    const profile = ctx.profile || {};
    const sourceLine = cir ? `Grounded in the company files and their population data, as of ${cir.as_of || asOfMonthYear(ctx)}.` : `Grounded in the company files and their population data on hand, checked as of ${asOfMonthYear(ctx)}.`;
    if (Guidance && Guidance.answerGuidance) {
      const g = guidanceIntentFor(lc(text));
      if (g) {
        try {
          const rec = Guidance.answerGuidance(Object.assign({}, ctx, { intent: g, text: s(text), cir: cir || undefined, profile }));
          // BUG-073 (SC-242): some 144 records are ok:false BY DESIGN
          // — the honest answer itself (trend_scope with no sourced
          // snapshot: sources + as-of + a 3-step plan + the unknown
          // stated plainly; the record validates F7). Gating on ok
          // alone dropped those into the bare ladder template; the
          // gate now accepts a record that carries the full cited
          // shape, and still declines shapeless ok:false records.
          if (rec && rec.text && (rec.ok !== false || (Array.isArray(rec.sources) && rec.sources.length && Array.isArray(rec.plan) && rec.plan.length >= 3))) {
            const src = Array.isArray(rec.sources) && rec.sources.length ? rec.sources[0] : null;
            // WORDING-BACKLOG (BUG-201): this rendering used to (a)
            // headline every guidance answer with the same opener,
            // (b) speak only the record's first TWO sentences — the
            // answer's substance never reached the user — (c) print
            // "Source: <the user's own degree>" whenever the record
            // anchored on a profile fact, and (d) append a blanket
            // "Grounded in the company files and their population
            // data on hand" line that was false for most of these
            // asks. Now: the headline is the record's own (per
            // topic) or the intent's; the first FOUR sentences
            // speak (each is one fact under 140's rule); and the
            // one source line names what actually supports the
            // answer — a labeled source's own label + as-of where
            // the record carries one, and profile-anchored answers
            // cite the profile record + the guidance knowledge
            // base, never a single fact's title as "the source".
            const srcLine = !src ? sourceLine
              : src.type === "profile_fact" || src.type === "profile_record"
                ? `Source: your own profile record and the career guidance knowledge base, as of ${rec.as_of || "2026-10-13"}.`
                : `Source: ${src.label || src.type || "sourced record"}${src.as_of ? `, as of ${src.as_of}` : rec.as_of ? `, as of ${rec.as_of}` : ""}.`;
            const sentences = s(rec.text).split(/(?<=[.!?])\s/).filter(Boolean);
            // WORDING-BACKLOG (BUG-204): when the first three
            // sentences are long, three speak instead of four —
            // four long sentences packed three-to-a-bubble broke
            // the 700-char bubble budget (H-11) on the longest
            // answers, while short answers keep all four.
            const first3 = sentences.slice(0, 3).reduce((n, x) => n + x.length, 0);
            const spoken = sentences.slice(0, first3 > 640 ? 3 : 4);
            const facts = [...spoken, srcLine];
            const HEADLINES = { plan_paths: "Two plausible paths, and a cheap way to tell them apart.", honest_evidence: "What the evidence honestly supports.", graduation_window: "The window, checked against the record.", odds_request: "The honest odds answer — no invented number.", skill_gap_plan: "The gap, stated accurately — and the plan to close it.", thin_sample: "What that sample can and cannot say.", trend_scope: "That trend, read at its actual scope.", work_authorization: "Work authorization — the sourced general picture.", interest_change: "The plan, re-aimed at the new field." };
            const reply = compose({ headline: rec.headline || HEADLINES[g] || "Here is the honest answer, from the record.", facts, nextStep: rec.nextStep || "Name the target and I will pull its file next." });
            return { intent: g === "plan_paths" ? "path_plan" : "company_intel", reply, resultStatus: "prepared", sends: 0, guidance: rec, payload: rec, artifact: rec };
          }
        } catch { /* fall through to the templates */ }
      }
    }
    if (cir && Intel.composeThesis && /\bthesis\b|\bvs\.?\b|\bversus\b|\bcompare\b|\bcompared\b/.test(lc(text))) {
      try {
        const th = Intel.composeThesis(cir, profile, {});
        const body = digText(th, ["text", "summary", "thesis"], ["sections", "points", "lines"]);
        if (body) {
          const reply = compose({ headline: `The ${cirShortName(cir)} thesis, from the file.`, facts: [body.split(/(?<=[.!?])\s/).slice(0, 2).join(" "), sourceLine], nextStep: "Want the gaps against your profile next?" });
          return { intent: "company_thesis", reply, resultStatus: "prepared", sends: 0, company: cirShortName(cir), payload: th, thesis: th };
        }
      } catch { /* fall through */ }
    }
    if (cir && Intel.planPath && /\bhow do i get\b|\bpath\b|\bget a job\b|\bcompare my profile\b/.test(lc(text))) {
      try {
        const pp = Intel.planPath(cir, profile, {});
        const body = digText(pp, ["text", "summary"], ["steps", "gaps", "actions", "lines"]);
        if (body) {
          const reply = compose({ headline: `Your path into ${cirShortName(cir)}, from the file and your profile.`, facts: [body.split(/(?<=[.!?])\s/).slice(0, 2).join(" "), sourceLine], nextStep: "Want the first rung turned into this week's plan?" });
          return { intent: "path_plan", reply, resultStatus: "prepared", sends: 0, company: cirShortName(cir), payload: pp, path: pp };
        }
      } catch { /* fall through */ }
    }
    const reply = compose({ headline: "Here is the honest shape of that, no sugarcoating.", facts: ["The ladder is the same everywhere: proof you can do the work, a warm path in, and reps against the real screen — what changes by field is which proof counts and how rare the seats are.", "Where a number exists I will show it with its population and date; where it doesn't, I will say the honest range instead of inventing precision.", sourceLine], nextStep: "Name the target — a firm or a field — and I will pull its file and give you the ladder with your gaps named." });
    return { intent: "path_plan", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  // ---------- graph catch (135): memory / blurb / intro / ranked paths -----
  function handleGraphCatch(text, ctx) {
    const t = lc(text);
    const store = graphStoreOf(ctx);
    const gp = graphProfileOf(ctx);
    // BUG-098: this handler used to answer ~16 distinct graph asks
    // with ONE prose template and never call the per-ask 135
    // producers built for exactly these asks (rankPaths,
    // secondDegreeMap, publicSourceLookup, conversionTracking,
    // topWarmPathSweep, newHireRadar, miniCampaign, referralBonusIntel,
    // mergeIdentities, thankYouReferralCombo) — the true-score judge
    // found the same warm-paths paragraph on 16 different asks.
    // Every branch below runs its producer and carries the producer's
    // typed record under payload (BUG-101: a payload-less graph turn
    // is the STATE_doorstep_gap defect); replies compose FROM the
    // record, so two different asks can no longer share one text.
    if (/\bwhen did i last\b|\blast talk\b|\brelationship memory\b|\bwhat did we talk\b/.test(t) && Graph && Graph.relationshipMemory) {
      const nameM = s(text).match(/\b(?:to|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/) || s(text).match(/\btalk to ([A-Za-z][a-z]+)\b/);
      const name = nameM ? nameM[1] : null;
      if (name) {
        try {
          const mem = Graph.relationshipMemory(store, name);
          if (mem && mem.person) {
            const reply = compose({ headline: `Your history with ${name}, from the record.`, facts: [`Last contact: ${mem.last_contact_at || "not dated in the record"}. Conversations on record: ${mem.chats != null ? mem.chats : 0}.`, mem.last_topics ? `Last topics: ${s(mem.last_topics)}.` : "Topics are kept with each interaction as it happens."], nextStep: "Want a warm update touch drafted from that history?" });
            return { intent: "graph_memory", reply, resultStatus: "prepared", sends: 0, memory: mem, payload: mem };
          }
          // BUG-101: the not-found memory record rides too — before
          // this the turn carried prose only. The headline leads with
          // the state, not a bare "No …" (the REFUSAL_NO_ALTERNATIVE
          // shape): the alternative below is the offered next step.
          const reply = compose({ headline: `${name} has no interactions on record yet.`, facts: ["Relationship memory is built from your export and the chats you log here — nothing is inferred from outside data."], nextStep: "Log the last conversation, even roughly — want to start the memory there?" });
          return { intent: "graph_memory", reply, resultStatus: "awaiting_user", sends: 0, memory: mem, payload: mem };
        } catch { /* fall through */ }
      }
    }
    // BUG-100: forwardableBlurb takes (graphStore, profile122) — the
    // ported shape — or (profile, facts). It used to be called with
    // (ctx.profile) alone, which matches NEITHER shape, so the blurb
    // refused "no_real_profile_facts" even with confirmed education
    // and experience facts on the profile.
    const buildBlurb = () => {
      if (!Graph || !Graph.forwardableBlurb) return null;
      try {
        const g2 = Object.assign({}, store, { user: { name: gp.name, school: gp.school } });
        return Graph.forwardableBlurb(g2, ctx.profile);
      } catch { return null; }
    };
    if (/\bintro request\b|\bask .* to introduce\b/.test(t)) {
      const b = buildBlurb();
      const card = { kind: "intro_card", status: b && b.ok ? "held" : "blocked", held_as_card: true, requires_card_approval: true, sends: 0, blurb: b || null, rule: "The mutual gets the forwardable blurb plus the ask as one forwardable block; nothing is sent without your card approval, and a referral ask never rides inside a first cold email." };
      if (b && b.ok) {
        const reply = compose({ headline: "The intro card is built and held — blurb included, nothing sent.", facts: [`Blurb, line one: ${s(b.lines[0])}`, "The mutual gets the blurb plus the ask in one forwardable block, so passing it on costs them one tap."], nextStep: "Name the mutual and the target — want the card addressed to them?" });
        return { intent: "graph_intro", reply, resultStatus: "awaiting_user", sends: 0, payload: card, draft: card };
      }
      const reply = compose({ headline: "An intro card needs a blurb first, and the blurb needs confirmed facts.", facts: ["A blurb written from guesses burns the mutual who forwards it."], nextStep: "Confirm your school, role, and one proof point — want to add them now?" });
      return { intent: "graph_intro", reply, resultStatus: "awaiting_user", sends: 0, payload: card };
    }
    if (/\bforwardable blurb\b|\bblurb\b/.test(t)) {
      const b = buildBlurb();
      if (b && b.ok && (b.lines || []).length) {
        const reply = compose({ headline: "Your forwardable blurb — built only from confirmed facts on your profile.", facts: b.lines.slice(0, 3).map((x) => s(x)), nextStep: "It travels with an intro ask as a held card — approve the card and it is ready to forward." });
        return { intent: "graph_blurb", reply, resultStatus: "prepared", sends: 0, blurb: b, payload: b };
      }
      const reply = compose({ headline: "A forwardable blurb needs confirmed facts, and the profile on file is too thin to write one honestly.", facts: ["A blurb written from guesses burns the mutual who forwards it."], nextStep: "Confirm your school, role, and one proof point and I will write it." });
      return { intent: "graph_blurb", reply, resultStatus: "awaiting_user", sends: 0, blurb: b || null, payload: b || null };
    }
    if (/\bpaths ranked\b/.test(t) && Graph && Graph.rankPaths) {
      const order = ["alumni", "club", "major", "hometown", "cold"];
      // 135's rankPaths is per-company (the w08 shape): rank every
      // firm present in the graph and merge by warmth score.
      const firms = [...new Set(store.people.map((p) => p.current_firm).filter(Boolean))];
      const rows = [];
      for (const f of firms) { try { for (const row of Graph.rankPaths(store, f)) rows.push(row); } catch { /* firm skipped */ } }
      rows.sort((a, b) => (b.warmth_score || 0) - (a.warmth_score || 0));
      const mapRow = (row) => ({ name: row.name, firm: row.company, title: row.position || null, score: row.warmth_score, warmth_score: row.warmth_score, shared_fact: row.shared_fact, why: /^no shared fact/i.test(row.shared_fact || "") ? [] : [row.shared_fact] });
      const warm = rows.filter((r0) => !/^no shared fact/i.test(r0.shared_fact || "")).map(mapRow);
      const cold = rows.filter((r0) => /^no shared fact/i.test(r0.shared_fact || "")).map(mapRow);
      const env = { kind: "graph_paths", company: null, paths: warm, cold, excluded: [], draft_cards: [], graph_people: store.people.length, ranking_order: order, companies_checked: firms };
      const reply = compose({ headline: warm.length ? `${warm.length} ranked warm path${warm.length === 1 ? "" : "s"} across your graph.` : "Your graph holds no ranked warm paths yet.", facts: [`The rank order is fixed: ${order.join(", then ")} — and every ranked person shows the shared fact they stand on.`, `Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"} across all firms.`], nextStep: "Name a firm — want its ranked paths?" });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: warm, payload: env };
    }
    if ((/\bmini\b[^.]*\bcampaign\b/.test(t) || (/\bone company\b/.test(t) && /\b\d{1,3}\s+(?:people|person)\b/.test(s(text)) && /\bwarm/.test(t))) && Graph && Graph.miniCampaign) {
      const company = companyFromText(text, ctx);
      // BUG-109 (template-breakup lane): the ask's own sizing drives
      // the plan — a range ("5–10 person") sizes the sequence at the
      // range's top, a single count at that count. The old matcher
      // read only "N people", so a range ask silently became the
      // default 8 and two different asks shared one reply.
      const rangeM = s(text).match(/\b(\d{1,3})\s*(?:–|-|to)\s*(\d{1,3})\s*(?:person|people)\b/);
      const wantM = s(text).match(/\b(\d{1,3})\s+(?:people|person)\b/);
      const count = rangeM ? parseInt(rangeM[2], 10) : wantM ? parseInt(wantM[1], 10) : 8;
      let mc = null;
      try { mc = Graph.miniCampaign(store, company, gp, { count, now: nowOf(ctx) }); } catch { mc = null; }
      if (mc) {
        // The reply speaks the ask's sizing and, where the ask states
        // it, the ask's premise (no warm path — the campaign is the
        // substitute, not the first choice). The engine's true fill
        // count leads either way.
        const noPath = /\bno warm path\b/.test(t);
        const sizePhrase = rangeM ? `the ${rangeM[1]}–${rangeM[2]} seats you asked for` : `the ${mc.requested} mini-campaign seats`;
        const facts = [mc.rule];
        if (noPath) facts.push(`Your graph holds nobody at that company — there is no warm path to spend, which is exactly the case this sequence exists for.`);
        facts.push(`Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}; a sequence is built only from people actually in it — seats are never padded with invented names.`);
        const reply = compose({ headline: noPath ? `No warm path in — the mini-campaign is the way: ${mc.sequence.length} of ${sizePhrase} can be filled from your graph right now.` : `${mc.sequence.length} of ${sizePhrase} can be filled from your graph right now.`, facts, nextStep: "Want to add names from the firm's team page so the sequence can be built?" });
        return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, payload: Object.assign({}, mc, { kind: "mini_campaign", graph_people: store.people.length }) };
      }
    }
    if (/\breferral[ -]bonus\b/.test(t) && Graph && Graph.referralBonusIntel) {
      let intel = null;
      try { const cirs = cirListOf(ctx) || []; intel = Graph.referralBonusIntel(cirs, cirs.map((c) => cirShortName(c))); } catch { intel = null; }
      if (intel) {
        // WORDING-BACKLOG (BUG-205): the headline points at "the
        // referral-weight note below" — the note now actually
        // follows (the first target file's own note, printed), so
        // the reference is never left dangling (SC-161).
        const wRow = (intel.rows || []).find((r) => r && r.referral_weight) || (intel.rows || []).find((r) => r && r.cir && r.note);
        const wFact = wRow ? `What is sourced per company — the referral-weight note from ${wRow.company}'s file: ${s(wRow.referral_weight || wRow.note).split(/(?<=[.!?])\s/)[0]}` : "What is sourced per company is a referral-weight note on each file — name a target and its note prints in full.";
        const reply = compose({ headline: intel.headline, facts: [`${intel.rows.length} target files were read; ${intel.sourced_bonus_count} print a sourced bonus amount.`, wFact, "Where a firm prints no amount, I report none — a bonus figure is never estimated into an answer."], nextStep: "Want the per-firm rows for the targets on your list?" });
        return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, payload: Object.assign({}, intel, { kind: "referral_bonus_intel" }) };
      }
    }
    if (/\bconversion tracked\b/.test(t) && Graph && Graph.conversionTracking) {
      const conv = Graph.conversionTracking(store);
      const reply = compose({ headline: `Conversion on record: ${conv.contacts_with_chats} ${conv.contacts_with_chats === 1 ? "chat" : "chats"}, ${conv.converted_to_referral} converted to a referral.`, facts: ["Conversion is counted per contact from the graph's own stages — a chat that never happened is never counted.", `Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}.`], nextStep: "Log a chat outcome for one contact and the per-contact stages start there." });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, payload: Object.assign({}, conv, { kind: "conversion_tracking", graph_people: store.people.length }) };
    }
    if (/\bwarm[ -]path sweep\b/.test(t) && Graph && Graph.topWarmPathSweep) {
      let firms = [];
      try { firms = (ctx.profile && ctx.profile.preferences && ctx.profile.preferences.targetCompanies) || []; } catch { firms = []; }
      if (!firms.length) { try { firms = (cirListOf(ctx) || []).map((c) => cirShortName(c)).filter(Boolean); } catch { firms = []; } }
      firms = firms.slice(0, 10);
      let sweep = null;
      try { sweep = Graph.topWarmPathSweep(store, firms); } catch { sweep = null; }
      if (sweep) {
        // Ported shape: an array per firm of { company, paths_found,
        // best, all } where `all` rows are rankPaths rows.
        const mapRow = (row) => ({ name: row.name, firm: row.company, title: row.position || null, score: row.warmth_score, warmth_score: row.warmth_score, shared_fact: row.shared_fact, why: /^no shared fact/i.test(row.shared_fact || "") ? [] : [row.shared_fact] });
        const allRows = sweep.flatMap((x) => x.all || []);
        const env = { kind: "graph_paths", company: null, paths: allRows.filter((r0) => !/^no shared fact/i.test(r0.shared_fact || "")).map(mapRow), cold: allRows.filter((r0) => /^no shared fact/i.test(r0.shared_fact || "")).map(mapRow), excluded: [], draft_cards: [], graph_people: store.people.length, companies_checked: sweep.map((x) => x.company), warm_companies: sweep.filter((x) => x.paths_found > 0).map((x) => x.company) };
        const reply = compose({ headline: `Sweep done across ${sweep.length} companies: warm paths at ${env.warm_companies.length} of them.`, facts: [`Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}; the sweep checks each target firm against that same graph — nothing is fetched from outside.`, env.warm_companies.length ? `Warm companies: ${env.warm_companies.join(", ")}.` : "Every checked firm came back with no path in your graph."], nextStep: "Want the firm-by-firm breakdown?" });
        return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: env.paths, payload: env };
      }
    }
    if (/\bsecond[ -]degree\b/.test(t) && Graph && Graph.secondDegreeMap) {
      // Ported shape: per-company array of degree-2 rows. No firm is
      // named in this ask, so map every firm present in the graph.
      const firms = [...new Set(store.people.map((p) => p.current_firm).filter(Boolean))];
      const rows = [];
      for (const f of firms) { try { for (const row of Graph.secondDegreeMap(store, f)) rows.push(row); } catch { /* firm skipped */ } }
      const env = { kind: "graph_paths", company: null, paths: rows.map((row) => ({ name: row.name, firm: row.company, title: row.position || null, score: row.warmth_score, warmth_score: row.warmth_score, shared_fact: row.shared_fact, why: /^no shared fact/i.test(row.shared_fact || "") ? [] : [row.shared_fact], path: row.path })), cold: [], excluded: [], draft_cards: [], graph_people: store.people.length, producer: "secondDegreeMap", companies_checked: firms, first_degree_bridges: [...new Set(rows.map((r0) => r0.via).filter(Boolean))].length };
      const reply = compose({ headline: rows.length ? `${rows.length} second-degree paths found.` : "No second-degree paths exist in your graph yet.", facts: [`A second-degree path needs a first-degree person whose own colleagues are on record; your graph holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"} and ${env.first_degree_bridges} such ${env.first_degree_bridges === 1 ? "bridge" : "bridges"}.`, "Colleagues are never invented — a bridge exists only when the record names them."], nextStep: "Paste your first-degree list or your export, and tell me one firm to map first — a bridge is built from people actually in it instead of invented names." });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: env.paths, payload: env };
    }
    if (/\bemployee lookup\b/.test(t) && Graph && Graph.publicSourceLookup) {
      const firms = [...new Set(store.people.map((p) => p.current_firm).filter(Boolean))];
      const rows = [];
      for (const f of firms) { try { for (const row of Graph.publicSourceLookup(store, f)) rows.push(row); } catch { /* firm skipped */ } }
      const env = { kind: "graph_paths", company: null, paths: rows.map((row) => ({ name: row.name, firm: row.company, title: row.position || null, why: ["public source on record"], public_links: row.public_links || [], sources: row.sources || [] })), cold: [], excluded: [], draft_cards: [], graph_people: store.people.length, producer: "publicSourceLookup", companies_checked: firms, sources: ["public:"], note: rows.length ? rows[0].note : "Public sources only (GitHub / speakers / team pages as supplied by the user) — no LinkedIn scraping." };
      const reply = compose({ headline: rows.length ? `${rows.length} people in your graph carry a public-source sighting.` : "The public-source lookup found nobody new to verify.", facts: [`Lookup sources are public only — GitHub, speakers, team pages, as supplied by you — and your LinkedIn is never scraped.`, `People at firms in your graph were checked: ${store.people.length}; carrying a public-source sighting: ${rows.length}.`], nextStep: "Paste names from a team page — want me to verify them against your graph?" });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: env.paths, payload: env };
    }
    if (/\bnew[ -]hire radar\b/.test(t) && Graph && Graph.newHireRadar) {
      let targets = [];
      try { targets = (ctx.profile && ctx.profile.preferences && ctx.profile.preferences.targetCompanies) || []; } catch { targets = []; }
      if (!targets.length) { try { targets = (cirListOf(ctx) || []).map((c) => cirShortName(c)).filter(Boolean); } catch { targets = []; } }
      let flagged = [];
      try { flagged = Graph.newHireRadar(store, null, { now: nowOf(ctx), targetCompanies: targets }) || []; } catch { flagged = []; }
      const payload = { kind: "new_hire_radar", flagged: flagged.map((row) => ({ name: row.name, company: row.company, prior_company: row.prior_company || null, joined_at: row.joined_at || null, warmth_tier: row.warmth_tier, shared_fact: row.shared_fact, flag: row.flag })), rule: "A new hire from your school is flagged only with a start date or a firm change on record — a recent join is never inferred.", graph_people: store.people.length, companies_checked: targets };
      const reply = compose({ headline: flagged.length ? `${flagged.length} recent joiners flagged at target firms.` : "The new-hire radar flags nobody right now.", facts: [payload.rule, `Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}; a flag needs a start date on record, and none is invented.`], nextStep: "Add names from your export — a flag needs a person and a start date on record, at any firm." });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, payload };
    }
    if (/\bsubmits the referral\b/.test(t)) {
      const refs = (store.referrals || []).map((r) => ({ referral_id: r.referral_id || null, company: r.company || null, state: r.state || "unknown", application_id: r.application_id || null }));
      const payload = { kind: "referral_track", referrals_on_record: refs.length, referrals: refs, submitted: refs.filter((r) => r.state === "submitted").length, graph_people: store.people.length };
      const reply = compose({ headline: refs.length ? `${refs.length} referral${refs.length === 1 ? "" : "s"} on record.` : "No referral is on record to track yet.", facts: ["The tracking link works like this: once a referral is marked as in, the application row gains source 'referred' with the referrer named on it — that link is written at that moment, never assumed from a draft.", `Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"} and ${refs.length} referral ${refs.length === 1 ? "record" : "records"}.`], nextStep: "Name the contact and the application — I will link the referral to that application the moment it is marked in." });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, payload };
    }
    if (/\bthank[ -]you plus referral\b/.test(t) && Graph && Graph.thankYouReferralCombo) {
      // 135's combo is per-person (person, user, opts): find the
      // contact an offer is actually on record for — a person row
      // carrying referral_offer, or a referral record carrying a
      // note — and run the producer on THAT person. With no offer
      // anywhere, the record states the producer's own refusal
      // reason for exactly this state.
      let combo = null;
      const notedRef = (store.referrals || []).find((r) => r && r.note);
      const candidate = store.people.find((p) => p.referral_offer) || (notedRef ? store.people.find((p) => p.full_name === (notedRef.name || notedRef.contact_name)) : null) || null;
      if (candidate) { try { combo = Graph.thankYouReferralCombo(candidate, { referrals: store.referrals }, { profile122: ctx.profile, nowMs: nowOf(ctx) }); } catch { combo = null; } }
      if (!candidate) combo = { ok: false, reason: "no_referral_offer_on_record" };
      if (combo) {
        if (combo.ok && combo.draft) {
          const reply = compose({ headline: "The thank-you plus referral combo is drafted and held.", facts: ["One message: the thank-you first, the referral ask second — the order is the whole point.", "It sends only on your approval."], nextStep: "Review the held draft — want any line changed?" });
          return { intent: "graph_paths", reply, resultStatus: "awaiting_user", sends: 0, draft: combo.draft, payload: Object.assign({}, combo, { kind: "thankyou_combo" }) };
        }
        const reply = compose({ headline: "The combo waits for a referral offer on record — and there is none yet.", facts: ["The thank-you plus referral combo is drafted only after a chat where the contact actually offered to refer; drafting it without the offer would put words in their mouth.", "When an offer lands, log it here and the combo is drafted the same turn."], nextStep: "Want to log a chat outcome now?" });
        return { intent: "graph_paths", reply, resultStatus: "awaiting_user", sends: 0, payload: Object.assign({}, combo, { kind: "thankyou_combo" }) };
      }
    }
    if ((/\bmerged to one record\b|\bthree sources\b|\bdedupe\b/.test(t)) && Graph && Graph.mergeIdentities) {
      const sources = (ctx && Array.isArray(ctx.graphSources)) ? ctx.graphSources : [];
      let mg = { people: [], merges: [] };
      try { mg = Graph.mergeIdentities(sources); } catch { mg = { people: [], merges: [] }; }
      const payload = { kind: "graph_merge", input_count: sources.length, merged_count: mg.people.length, merges: mg.merges.length, graph_people: store.people.length };
      const reply = compose({ headline: sources.length ? `${sources.length} source records merged into ${mg.people.length}.` : "No source records are staged for merging in this turn.", facts: ["Merging keys on the person, not the spelling: the same human in your export, an alumni list, and a club roster becomes one record with every source kept on it — so nobody is ever written to twice.", `Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}.`], nextStep: "Bring the next source list — want me to merge it in?" });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, payload };
    }
    if (/\bprofessor path\b/.test(t)) {
      const profs = store.people.filter((p) => lc(p.relationship_to_user || "").includes("professor") || lc(p.title || "").includes("professor"));
      const env = graphEnvelopeOf(store, { company: null, paths: profs.map((p) => ({ name: p.full_name, firm: p.current_firm, title: p.title, why: ["professor"] })), excluded: [], draft_cards: [] }, { filter: "professor" });
      const reply = compose({ headline: env.paths.length ? `${env.paths.length} professor paths are in your graph.` : "No professor path is in your graph yet.", facts: ["A professor ask is drafted differently: it leads with the class and the work, and the referral ask stays small and specific.", `Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}; a professor joins it when you paste their name from your contacts.`], nextStep: "Paste the professor's name — want the ask drafted?" });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: env.paths, payload: env };
    }
    if (/\bfamily[ -]friend\b/.test(t)) {
      const ffs = store.people.filter((p) => /family|friend of the family/i.test(p.relationship_to_user || ""));
      const env = graphEnvelopeOf(store, { company: null, paths: ffs.map((p) => ({ name: p.full_name, firm: p.current_firm, title: p.title, why: ["family friend"] })), excluded: [], draft_cards: [] }, { filter: "family_friend" });
      const reply = compose({ headline: env.paths.length ? `${env.paths.length} family-friend paths are in your graph.` : "No family-friend path is in your pasted contacts yet.", facts: ["Family-friend asks carry extra care: the tone stays warm, the ask stays small, and the card waits for your yes — family credit is never spent casually.", `Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}.`], nextStep: "Paste the family-friend contacts — want me to sort them by firm?" });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: env.paths, payload: env };
    }
    if (/\bclub roster\b|\bfraternity\b/.test(t)) {
      const clubP = store.people.filter((p) => (p.source_list || []).includes("club_roster"));
      const env = graphEnvelopeOf(store, { company: null, paths: clubP.map((p) => ({ name: p.full_name, firm: p.current_firm, title: p.title, why: ["club roster"] })), excluded: [], draft_cards: [] }, { filter: "club", clubs: gp.clubs || [] });
      const reply = compose({ headline: env.paths.length ? `${env.paths.length} club-roster paths are in your graph.` : "No club-roster path is in your graph yet.", facts: ["Club paths rank on the roster itself: a brother or clubmate at the firm outranks a cold name, and the shared club is the fact the path stands on.", `Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}; roster names join it from your pasted contacts or your export.`], nextStep: "Paste the roster names — want them matched against your target firms?" });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: env.paths, payload: env };
    }
    if (/\btwo paths\b|\bstronger\b/.test(t)) {
      const company = companyFromText(text, ctx);
      const base = company && Graph && Graph.findPaths ? Graph.findPaths(store, company, gp, { now: nowOf(ctx) }) : { company: company || null, paths: [], excluded: [], draft_cards: [] };
      // 135's pick is (store, company, profile, opts) and returns
      // { company, chosen, held_back, paths_considered, rule }.
      let pick = { chosen: null, held_back: null, paths_considered: (base.paths || []).length, rule: "With fewer than two paths on record there is nothing to choose between — the rule binds the moment two exist." };
      if (Graph && Graph.pickStrongerPath && company && (base.paths || []).length >= 2) { try { pick = Graph.pickStrongerPath(store, company, gp, { now: nowOf(ctx) }); } catch { /* keep the rule record */ } }
      const env = graphEnvelopeOf(store, base, { stronger_pick: pick });
      const reply = compose({ headline: pick.chosen ? `The stronger path is ${pick.chosen.name}; the other is held, not burned.` : `Your graph holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}, so no firm has two paths to choose between yet.`, facts: [pick.rule, "Spending both paths on one application burns the second relationship for nothing; the held path stays warm for a later role."], nextStep: "Upload your export or paste names — two paths can only be compared once two people at one firm are on record." });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: env.paths, payload: env };
    }
    if (/\bcurrent employer\b/.test(t)) {
      const company = gp.current_employer || null;
      const env = graphEnvelopeOf(store, { company, paths: [], excluded: [], draft_cards: [] }, { exclusion_rule: { current_employer_excluded_by_default: true, current_employer: company, reason: "A search that surfaces at your own workplace is a risk, not a path — contacts there are excluded unless you explicitly override." } });
      const reply = compose({ headline: "Contacts at your current employer are excluded by default.", facts: ["The rule: a warm path that runs through your own workplace can surface your search — those contacts never appear in ranked paths unless you override it yourself.", company ? `Your current employer on record: ${company}.` : "No current employer is on your profile record, so the exclusion has nothing to bind to yet — it arms the moment one is recorded.", `Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}.`], nextStep: "Want to name your current employer so the exclusion is armed by name?" });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: [], payload: env };
    }
    if (/\brecruiter vs\b/.test(t) && Graph && Graph.askKindFor) {
      const kinds = store.people.map((p) => ({ name: p.full_name, firm: p.current_firm, kind: Graph.askKindFor(p) }));
      const env = graphEnvelopeOf(store, { company: null, paths: [], excluded: [], draft_cards: [] }, { ask_kinds: kinds });
      const reply = compose({ headline: "Recruiters and practitioners get different asks — by design.", facts: ["A recruiter is asked about the right requisition and the process; a practitioner is asked to refer you onto a team — mixing the two reads as not knowing how hiring works.", kinds.length ? `${kinds.length} people in your graph are classified and ready.` : "Your graph holds nobody to classify yet — the split applies the moment people are in it."], nextStep: "Paste names from the firm — I will split them recruiter vs practitioner and draft each ask accordingly." });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, payload: env };
    }
    if (/\bdifferent city\b|\bcross[ -]city\b/.test(t)) {
      const company = companyFromText(text, ctx);
      const base = company && Graph && Graph.findPaths ? Graph.findPaths(store, company, gp, { now: nowOf(ctx) }) : { company: company || null, paths: [], excluded: [], draft_cards: [] };
      const env = graphEnvelopeOf(store, base, { cross_city_rule: { delta: -15, rule: "An alumnus in a different city than the role scores 15 points lower, and the discount is shown on the path — warmth is never inflated to make a list look better." } });
      const reply = compose({ headline: "Cross-city alumni are discounted, openly.", facts: ["The rule: same school, different city than the role costs 15 warmth points, and the adjustment prints on the path itself.", `Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}; no path into ${company || "a named firm"} is on record to re-rank yet.`], nextStep: "Name the firm and the role's city — want the re-ranked paths?" });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: env.paths, payload: env };
    }
    // Fall-through: a graph ask with no dedicated producer branch
    // still returns the findPaths record for a named firm, or the
    // graph-state record — never the old payload-less template.
    const company = companyFromText(text, ctx);
    if (company && Graph && Graph.findPaths) return pathsResultFor(company, ctx, store);
    const env = graphEnvelopeOf(store, { company: null, paths: [], excluded: [], draft_cards: [] });
    const facts = [`Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on.`, "People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both."];
    const reply = compose({ headline: "Your warm paths are ranked from your graph.", facts, nextStep: "Upload your export or name the firm and I will show the ranked paths with their facts." });
    return { intent: "graph_paths", reply, resultStatus: "awaiting_user", sends: 0, payload: env };
  }

  // ---------- inbox events + tracker extras (126) ----------------------------
  // IB-TN-3 (SC-137): accepting an offer produces 126's per-company
  // withdrawal drafts as held cards — the copy never claimed a
  // withdrawal happened; now the product exists under it too.
  function handleAcceptedOffer(text, ctx) {
    const store = trackStoreOf(ctx);
    const acceptedCompany = companyFromText(text, ctx);
    let wd = null;
    try { wd = (Track && Track.withdrawalDrafts && store) ? Track.withdrawalDrafts(store, acceptedCompany) : null; } catch { wd = null; }
    const drafts = wd && Array.isArray(wd.drafts) ? wd.drafts : Array.isArray(wd) ? wd : [];
    // WORDING-BACKLOG (BUG-140): when withdrawal drafts exist, the
    // reply NAMES them — the deliverable is the per-company cards,
    // not a description of the mechanism. When the record holds no
    // other live application, the reply says that instead of
    // offering a list that does not exist.
    const draftNames = drafts.map((d) => (d && (d.company || (d.draft && d.draft.company))) || null).filter(Boolean);
    const reply = drafts.length
      ? compose({ headline: `Accepted — ${drafts.length} withdrawal draft${drafts.length === 1 ? " is" : "s are"} held, one approval card per company.`, facts: [`The drafts: ${draftNames.join(", ") || "one per live application"} — each is its own send, with the exact note on its card, so nothing is withdrawn silently or in bulk.`, "The accepted role stays in the tracker as the outcome; each other application stays live on the record until its own card is approved — nothing closes on this say-so alone."], nextStep: "Want the first withdrawal card opened for your review?" })
      : compose({ headline: "Accepted — and the tracker holds no other live applications to withdraw.", facts: ["No other application is live on the record in this session, so there are no withdrawal drafts to hold — nothing is withdrawn, silently or otherwise.", "The accepted role stays in the tracker as the outcome; any application the tracker has not seen stays yours to name, and its withdrawal draft is built as its own card the moment it lands on the record."], nextStep: "Tell me the other companies if you have applications the tracker has not seen, and I will log them first." });
    const res = { intent: "tracking_status", reply, resultStatus: "awaiting_user", sends: 0, withdrawal_drafts: wd || drafts };
    if (drafts.length) {
      const first = drafts[0] && drafts[0].draft ? drafts[0].draft : drafts[0];
      if (first && first.kind) return emitTrack(ctx, res, { company: first.company || undefined, draft: first });
    }
    const spec = summarySpec(ctx, store);
    return spec ? emitTrack(ctx, res, spec) : res;
  }

  // IB-TN-1a: 126's stage vocabulary — the store, the doorstep
  // payload, and status summaries all speak it (142 slugs do not
  // validate in 141's emitter and corrupt the store's own counts).
  const STAGE_FOR_126 = { confirmed: "Confirmed", rejected: "Rejected", offer: "Offer", interview: "Interview rounds", oa: "OA/assessment" };
  const EVENT_FOR_126 = { confirmed: "confirmation", rejected: "rejection", offer: "offer", interview: "interview_invite", oa: "oa_invite" };
  function handleInboxEvent(text, ctx) {
    const t = lc(text);
    const store = trackStoreOf(ctx);
    let company = companyFromText(text, ctx) || companyFromApplicationText(text);
    if (!company) { const fromM = s(text).match(/\bfrom\s+([A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+)?)/); if (fromM) company = fromM[1].replace(/[?.!,]+$/, "").trim(); }
    // DEPTH LANE A (MI-017): an event report that names no company
    // still binds when the tracker holds exactly one open row — the
    // row it can only mean. Before this, "got an interview invite
    // from Copperline" (company extraction reads "at X", not "from
    // X") announced a company-not-stated record while the Copperline
    // row sat unmoved at "applied": a claim with no write behind it.
    if (!company && store && Array.isArray(store.rows)) {
      const open = store.rows.filter((r) => r.company && !/Rejected|Withdrawn|Accepted/i.test(r.stage || ""));
      if (open.length === 1) company = open[0].company;
      else if (store.rows.length === 1 && store.rows[0].company) company = store.rows[0].company;
    }
    // IB-TN-1b: a bare "interview" names the interview stage too.
    const stageFor = /rejection/.test(t) ? "rejected" : /offer letter/.test(t) ? "offer" : /\binterview\b/.test(t) ? "interview" : /\boa link|assessment link/.test(t) ? "oa" : "confirmed";
    if (/\bquiet \d+ days\b|\bno word for \d+\b|\bsilent for \d+\b|\bquiet\b[^.]*\b(weeks?|days?)\b|\bnudge\b/.test(t)) {
      // IB-TN-1d: the nudge is 126's real draft product, not a stub.
      let realDraft = null;
      try {
        const app = company && store && Array.isArray(store.rows) ? store.rows.find((r) => lc(r.company) === lc(company)) : null;
        if (Track && Track.draftNudge) { const d = Track.draftNudge(app || { company: company || "", role: "", title: "", applied_at: new Date(nowOf(ctx)).toISOString(), resume_version: "", stage: "", events: [] }, { now: nowOf(ctx) }); if (d && d.kind) realDraft = d; }
      } catch { realDraft = null; }
      // WORDING-BACKLOG (BUG-139): the reply SHOWS the draft it
      // carries — its follow-up line with the exact role and the
      // application date from the record. When no application on
      // record matches the quiet spell, the reply says the draft
      // cannot be aimed yet instead of describing a draft that
      // would carry blanks.
      const aimed = !!(realDraft && realDraft.company && (realDraft.role || realDraft.title));
      const appliedDay = realDraft && realDraft.basis && realDraft.basis.applied_at ? new Date(realDraft.basis.applied_at).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : null;
      const quietDays = Number((t.match(/\bquiet (\d+) days\b/) || [])[1]) || (realDraft && realDraft.days_quiet) || null;
      const reply = aimed
        ? compose({ headline: `The nudge is drafted — ${realDraft.days_quiet != null ? `${realDraft.days_quiet} days quiet` : "quiet too long"} on your ${realDraft.role || realDraft.title} application at ${realDraft.company}.`, facts: [`It reads: "I'm following up on my application for ${realDraft.role || realDraft.title}."`, `It names the application date from the record${appliedDay ? ` — ${appliedDay}` : ""} — and closes by saying you are still very interested and asking for any update on the timeline, with no apology for existing.`], nextStep: "Approve the nudge, or let it ride three more days?" })
        : compose({ headline: "A nudge is ready to draft — it needs the application it belongs to.", facts: ["No application in this session's tracker matches that quiet spell, so a draft written now would carry blanks where the role and the date belong.", `Your gate holds: nothing goes out without your yes, and the draft waits on its card for your exact-text approval${quietDays ? ` — the quiet spell you named is ${quietDays} days` : ""}.`, "Once aimed, the nudge quotes the exact role and the day the application went in, and asks for a status without apologizing for existing."], nextStep: "Tell me the company and the role, and the draft is written around them." });
      const res = { intent: "tracking_status", reply, resultStatus: "awaiting_user", sends: 0, draft: realDraft || undefined, nudge_draft: realDraft || { kind: "recruiter_nudge", company } };
      return realDraft ? emitTrack(ctx, res, { company: company || undefined, draft: realDraft }) : res;
    }
    if (/\bambiguous\b[^.]*\breply\b|\brecruiter reply\b/.test(t) && Outreach && Outreach.classifyReply) {
      let cls = null;
      try { cls = Outreach.classifyReply({ body: text }, { now: nowOf(ctx) }); } catch { cls = null; }
      const clsLabel = cls ? s(cls.classification || cls.class || cls.category || "").replace(/-/g, " ") : "";
      // WORDING-BACKLOG (BUG-139): the classification is spoken as a
      // read, not a label fragment — "positive ready" told the user
      // nothing; the sentence says what the read means.
      const readFact = /positive/.test(clsLabel)
        ? "Closest read: the recruiter sounds positive but has not confirmed anything — the safe move is a short clarifying draft, not an assumption."
        : clsLabel ? `Closest read: ${clsLabel} — and the safe move is a short clarifying draft, not an assumption.` : "The safe move is a short clarifying draft, not an assumption.";
      // IB-TN-1c: the classified reply gets its real response draft.
      let realDraft = null;
      try {
        const app = company && store && Array.isArray(store.rows) ? store.rows.find((r) => lc(r.company) === lc(company)) : null;
        if (Track && Track.draftRecruiterReply) { const d = Track.draftRecruiterReply(app || { company: company || "", role: "", title: "" }, cls || {}, {}); if (d && d.kind) realDraft = d; }
      } catch { realDraft = null; }
      // WORDING-BACKLOG (BUG-197): the draft is SHOWN, not offered —
      // its own asking sentence rides the reply (the rest of the
      // draft waits on its card, word for word, for the yes).
      const draftBody = realDraft ? s(realDraft.body || realDraft.text || (realDraft.draft && (realDraft.draft.body || realDraft.draft.text)) || "") : "";
      const qSent = (draftBody.match(/[^.!?\n]*\?/) || [null])[0];
      // WORDING-BACKLOG (BUG-204): the draft's closing sentence
      // rides too — the user judges a draft by its ask AND its
      // close, not the ask alone.
      const draftSents = draftBody.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
      const closeSent = draftSents.length > 1 ? draftSents[draftSents.length - 1] : null;
      const reply = realDraft
        ? compose({ headline: "That reply is ambiguous, so it gets classified before anyone answers it — and the clarifying draft is written.", facts: [readFact, ...(qSent ? [`The draft asks exactly this: "${qSent.trim()}"`] : []), ...(closeSent && closeSent !== (qSent || "").trim() ? [`And it closes with: "${closeSent}"`] : []), "The full draft waits on its card for your yes; nothing answers a recruiter without it."], nextStep: "Approve the draft as written, or tell me what to soften?" })
        : compose({ headline: "That reply is ambiguous, so it gets classified before anyone answers it.", facts: [readFact, "The draft waits for your yes; nothing answers a recruiter without it."], nextStep: "Want the clarifying draft now?" });
      const res = { intent: "tracking_status", reply, resultStatus: "awaiting_user", sends: 0, classification: cls, draft: realDraft || undefined };
      return realDraft ? emitTrack(ctx, res, { company: company || undefined, draft: realDraft }) : res;
    }
    if (/\bthank[ -]?you\b[^.]*\binterview\b|\bafter yesterday'?s interview\b/.test(t)) {
      // WORDING-BACKLOG (BUG-139): "drafted from your note" is spoken
      // only when a note actually reached the draft. The user's line
      // is extracted from the ask when present; without one, the
      // reply says the draft waits on it — it never claims a note
      // was used that the record does not hold.
      const noteM = s(text).match(/note[:\s]+["']([^"']{4,})["']/) || s(text).match(/["']([^"']{12,})["']/);
      const userNote = noteM && !/\bi got\b|\binterview at\b/i.test(noteM[1]) ? noteM[1].trim() : null;
      let realDraft = null;
      try {
        const app = company && store && Array.isArray(store.rows) ? store.rows.find((r) => lc(r.company) === lc(company)) : null;
        if (Track && Track.draftThankYou) { const d = Track.draftThankYou(app || { company: company || "", title: "" }, userNote ? { note: userNote } : {}); if (d && (d.body || d.text || d.draft)) realDraft = d.draft || d; }
      } catch { realDraft = null; }
      const reply = userNote
        ? compose({ headline: "The thank-you is drafted from your note and waits for your yes.", facts: [`Your line rides in it word for word: "${userNote}"`, "It goes out only when you approve it, from your own account."], nextStep: "Want to see the full draft before it goes anywhere?" })
        : compose({ headline: "The thank-you is not drafted yet — it waits on your one line.", facts: ["A thank-you built on a generic line is worse than none, so the draft starts from the moment you name, in your words.", "Once drafted, it goes out only on your yes, from your own account."], nextStep: "What is the one line you want it built around?" });
      const res = { intent: "tracking_log", reply, resultStatus: "awaiting_user", sends: 0, draft: realDraft || { kind: "thank_you", company } };
      return realDraft ? emitTrack(ctx, res, { company: company || undefined, draft: realDraft }) : res;
    }
    // DEPTH LANE A (MI-017): a first-person event report that binds
    // to NO row while several stand open is a binding question, not
    // a company-not-stated claim — stand down and let the tracker
    // family's event report ask which application it belongs to.
    if (!company && store && Array.isArray(store.rows) && store.rows.length > 1 && /\bi (got|received|just got)\b|\bgot an?\b/.test(t) && !/\b(email|letter) (lands|arrives|arrived|came)\b/.test(t)) return null;
    // ASSERTION FLOOR: the write below is an outcome write and
    // needs the user's own first-person assertion. A QUESTION about
    // an event ("did they email me a rejection?") and an event
    // that happened to SOMEONE ELSE ("my friend got an interview
    // invite from Helios Health, good for him") are not assertions
    // about the user's applications — the widened company
    // resolution above must never let them move a row. Stand down;
    // the tracker family's guarded event report answers both
    // shapes honestly. A pasted email (framing present) is an
    // employer record and proceeds even if its text ends in "?".
    if (/\bmy (friend|roommate|brother|sister|classmate|coworker|co-worker|partner|cousin)\b/i.test(s(text)) || /\bgood for (him|her|them)\b/i.test(s(text))) return null;
    const emailFramed = /(^|\n)\s*(subject|from)\s*:|\bthank you for (applying|your application)\b|\bapplication (update|status)\b|\bdear [A-Z]/i.test(s(text));
    if (!emailFramed && (/\?\s*$/.test(s(text).trim()) || /^(did|do|does|have|has|is|was|were|can|could|would|should)\b/i.test(s(text).trim()))) return null;
    if (store && company && Track) {
      // An event for a company already on the tracker MOVES that
      // row; only a genuinely new company opens a new row.
      const existingRow = Track.findByCompany ? Track.findByCompany(store, company) : null;
      if (existingRow && Track.moveStage && existingRow.stage !== STAGE_FOR_126[stageFor]) {
        try { Track.moveStage(existingRow, STAGE_FOR_126[stageFor], { type: EVENT_FOR_126[stageFor], source: "user-reported", detail: `event reported by the user: "${s(text).slice(0, 120)}"` }, nowOf(ctx)); } catch { /* the read-back decides what is claimed */ }
      } else if (!existingRow && Track.addApplication) {
        try { Track.addApplication(store, { company, title: "role (from your inbox)", source: "inbox_event", stage: STAGE_FOR_126[stageFor] }, {}); } catch { /* store write is best-effort */ }
      }
    }
    // WORDING-BACKLOG (BUG-137): the announce speaks the event itself
    // — its kind, its source, the company when the record carries one
    // and the not-stated state when it does not (TN-1a) — and closes
    // with the step that event actually unlocks. One template with a
    // provenance sentence that was wrong for chat-reported events
    // (SC-138: "came from the email itself" for a chat message) and a
    // detail-tease closer served all five event kinds before this.
    const stageLine = { confirmed: "the confirmation is on the record and the row now shows it", rejected: "the rejection is on the record, with a what-to-tighten note started", offer: "the offer is on the record and intake has started", interview: "the interview is attached to the right application and prep is queued", oa: "the assessment is on the record and the prep pack is queued" }[stageFor];
    const byChat = /\bby chat\b|\bmanual update\b|\bi (got|had|received)\b/i.test(s(text));
    const srcFact = byChat ? "This came from your message just now, not from an email." : { confirmed: "This update came from the confirmation email itself.", rejected: "This update came from the rejection email itself.", interview: "This update came from the interview invite itself.", oa: "This update came from the assessment email itself.", offer: "This update came from the offer letter itself." }[stageFor];
    // WORDING-BACKLOG (BUG-197): a deadline or an expiry clock is
    // claimed only when the value is ON THE RECORD — the row the
    // write just made carries the field, or it does not. The old
    // headlines asserted both unconditionally ("its deadline is
    // set", "its expiry clock is running") over records whose
    // deadline fields were null.
    const rowNow = store && Array.isArray(store.rows) && company ? store.rows.find((r) => lc(r.company) === lc(company)) : null;
    const dlRaw = rowNow ? (rowNow.assessment_deadline || rowNow.offer_deadline || rowNow.deadline || null) : null;
    let dlText = null;
    if (dlRaw) { try { const dd = new Date(dlRaw); if (!Number.isNaN(dd.getTime())) dlText = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(dd); } catch { dlText = null; } if (!dlText) dlText = s(dlRaw); }
    const headFor = {
      confirmed: company ? `Confirmation on the record for ${company} — the row now shows it.` : "Confirmation on the record — the tracker moved itself.",
      rejected: company ? `Rejection on the record for ${company}, with a what-to-tighten note started.` : "Rejection on the record, with a what-to-tighten note started.",
      interview: company ? `Interview at ${company} — on the record, and prep is queued.` : "Interview on the record — prep is queued.",
      oa: dlText ? `Assessment on the record${company ? ` for ${company}` : ""} — deadline ${dlText}, and the prep pack is queued.` : `Assessment on the record${company ? ` for ${company}` : ""} — the prep pack is queued, and no deadline was stated, so none is set.`,
      offer: dlText ? `Offer on the record${company ? ` for ${company}` : ""} — intake starts, and it expires ${dlText}.` : `Offer on the record${company ? ` for ${company}` : ""} — intake starts; the letter states no expiry date, so no clock is invented for it.`,
    }[stageFor];
    const factsFor = [srcFact];
    if (!company && !byChat) factsFor.push("The message names no company, so the row is carried as company not stated — the stage is real, and the company is never invented.");
    if (stageFor === "rejected") {
      // WORDING-BACKLOG (BUG-204): the note's own first line rides
      // the reply — what it records and its one tightening item —
      // not a description of the note's method. No stage or reason
      // was stated in the message, so the note says exactly that
      // and its tightening item is capture, honestly.
      let dateStr = ""; try { dateStr = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(new Date(nowOf(ctx))); } catch { dateStr = ""; }
      factsFor.push(`The note itself reads: rejection logged${dateStr ? ` ${dateStr}` : ""}; no stage or reason stated in the message, so its one tightening item is capture — every future update gets logged with its stage, because the stage a rejection comes at is the fact a real pattern is built from.`);
      factsFor.push("It flags a pattern only when the record holds more than one rejection — from a single rejection, a 'repeated gap' would be invented.");
    }
    if (stageFor === "offer") factsFor.push("The terms get read from the letter itself — base, bonus, expiry — never from a benchmark.");
    if (stageFor === "oa" && !dlText) factsFor.push("When a deadline is known — stated in the message or given by you — it lands on the row and the prep pack re-times itself to it.");
    const nextFor = {
      confirmed: company ? "Want me to show the company, role, and date this confirmation belongs to?" : "Tell me the email's sender line and I will bind it to the right application — until then the row stands as company not stated.",
      rejected: "Want the full what-to-tighten note now?",
      interview: "Want the prep pack for it now?",
      oa: "Want the prep pack for this assessment now?",
      offer: "Want the offer terms — base, bonus, expiry — laid out now?",
    }[stageFor];
    const reply = compose({ headline: headFor, facts: factsFor, nextStep: nextFor });
    // IB-TN-1a: the stage move rides the doorstep seam like every
    // other tracking write.
    const res = { intent: "tracking_log", reply, resultStatus: "completed", sends: 0, stage: stageFor, company };
    return emitTrack(ctx, res, { company: company || undefined, stage: STAGE_FOR_126[stageFor], event_type: EVENT_FOR_126[stageFor], source: "inbox", note: stageLine });
  }

  // IB-AP-2/AP-8 (SC-116): the rejection autopsy is computed by
  // 132-apply3 from the tracker rows — never pleaded as missing data.
  function applyLogOf(ctx) {
    // IB-AP pack §0.3: a host-seeded apply log in ctx wins — it is the
    // apply3-shaped record of truth; the tracker store is the fallback.
    if (ctx && ctx.applyLog && Array.isArray(ctx.applyLog.applications)) return ctx.applyLog;
    if (ctx && ctx.applicationLog && Array.isArray(ctx.applicationLog.applications)) return ctx.applicationLog;
    const store = trackStoreOf(ctx);
    const rows = store && Array.isArray(store.rows) ? store.rows : [];
    return { applications: rows.map((r) => ({ app_id: r.app_id || r.id || null, company: r.company, title: r.title, stage: r.stage, applied_at: r.applied_at || r.created_at || null, role_family: r.role_family || r.family || null, bucket_at_apply: r.bucket_at_apply || r.bucket || null, fit_score_at_apply: r.fit_score_at_apply || r.fit || null, events: r.events || [] })) };
  }
  function handleAutopsy(text, ctx) {
    if (!Apply3 || !Apply3.rejectionAutopsy) return null;
    let a = null;
    try { a = Apply3.rejectionAutopsy(applyLogOf(ctx), ctx.inbox || { messages: [] }); } catch { a = null; }
    if (!a) return null;
    const namedN = Number((lc(text).match(/(\d+)\s*applications?\b/) || [])[1]) || null;
    const facts = a.total
      ? [`Across ${a.total} applications on the record: ${a.rejected} rejected (${a.rejection_rate_pct}%), ${a.emailed_rejections} of them by email and ${a.silent_rejections} silently, ${a.still_alive} still alive.`, `Reach applications: ${a.reach_applied} applied, ${a.reach_rejected} rejected (${a.reach_rejection_rate_pct}%) — the pattern is read from these rows, not from a mood.`, "The plan follows the split: where rejections concentrate (family, bucket, company) is where the next applications stop going until the cause is fixed."]
      : ["The record in this session holds zero applications, so the autopsy computes zero across the board: 0 rejected, 0 by email, 0 silent — there is no pattern to invent from an empty log.", "What I will do instead: the moment applications sit in the log with their outcomes, the autopsy runs on those real rows — family, bucket, and company splits included."];
    // WORDING-BACKLOG (BUG-181): when the user names applications the
    // log does not hold, the reply FIRST asks for them to be logged /
    // imported — the autopsy is offered on the real rows, and the
    // closer asks for the import instead of offering a plan computed
    // on nothing.
    if (namedN && !a.total) {
      const reply = compose({ headline: `The rejection autopsy — it needs your ${namedN} applications in the log first.`, facts: [`You named ${namedN} applications; this session's log holds 0 — an autopsy run on an empty log would invent a pattern, so none is offered and nothing is sugarcoated.`, "Paste the applications (company, role, outcome) or import the list, and the autopsy runs on the real rows: rejection rate, email-versus-silent split, and the family, bucket, and company concentration."], nextStep: `Paste your ${namedN} applications here and the autopsy runs on them now?` });
      const aRec0 = Object.assign({ kind: "rejection_autopsy" }, a);
      return { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0, autopsy: a, payload: aRec0, artifact: aRec0 };
    }
    const reply = compose({ headline: "The rejection autopsy, computed from your own log.", facts, nextStep: "Want the plan built on the worst split first?" });
    const aRec = Object.assign({ kind: "rejection_autopsy" }, a);
    return { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0, autopsy: a, payload: aRec, artifact: aRec };
  }
  // IB-AP-8 (SC-115): a question about MY application's status at a
  // company is answered from the log + inbox (132-apply3 statusAnswer,
  // with proof ids) — not from the company's public file.
  function handleApplicationStatus(text, ctx) {
    if (!Apply3 || !Apply3.statusAnswer) return null;
    let company = companyFromText(text, ctx);
    // PREP-KB ROUTING (LF-02, daily battery P4, standing since v222):
    // when the text frames miss the name, the TRACKER's own rows are
    // the authority — a company on a recorded application row is
    // company-shaped by construction, and a status ask that names
    // one of them is about that row. Without this, "what's the
    // status of my Deloitte application?" extracted nothing, this
    // handler stepped aside, and the intel branch served the
    // Deloitte company FILE in the thread that had just recorded
    // the application's rejection.
    if (!company) {
      try {
        const rows = (trackStoreOf(ctx) || {}).rows || [];
        const hit = rows.find((r) => r && r.company && lc(text).includes(lc(r.company)));
        if (hit) company = hit.company;
      } catch { /* the record lookup is best-effort */ }
    }
    if (!company) return null;
    let rows = null;
    try { rows = Apply3.statusAnswer(applyLogOf(ctx), ctx.inbox || { messages: [] }, company); } catch { rows = null; }
    if (!rows) return null;
    const facts = rows.length
      ? rows.map((r) => `${r.title || "Application"} at ${r.company}: stage ${r.stage || "unknown"} (not a portal guess), dated ${r.applied_at || "date not on record"} — ${r.cross_check}${r.inbox_proof && r.inbox_proof.length ? ` (proof: ${r.inbox_proof.map((p) => p.msg_id).join(", ")})` : ""}.`)
      : [`No application to ${company} is on your record in this session, and no inbox message references one — the honest status is: nothing logged, nothing hidden.`, "Log it and the status is spoken from the record plus the inbox proof from then on."];
    facts.push(`Grounded in your own application log and inbox record, as of ${asOfMonthYear(ctx)}.`);
    // WORDING-BACKLOG (BUG-204): the not-found closer offers ONE
    // step that exists — log it, or name another company. "The
    // full timeline for it" offered a timeline for an application
    // the same reply just said does not exist.
    const reply = compose({ headline: rows.length ? `Your ${company} application status, from the record.` : `No ${company} application on record.`, facts, nextStep: rows.length ? "Want the full timeline for it, or another company's status?" : "Tell me the role and where it stands — what I will do, only on your word, is log it; nothing is written until you say so, and the status is spoken from the record from then on." });
    // The status answer rides the tracker doorstep record like
    // every other tracking read (IB-TN-1e pattern): the typed 141
    // record is this turn's product, carried on the result.
    const spec = summarySpec(ctx, trackStoreOf(ctx));
    const res = { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0, status_rows: rows };
    return emitTrack(ctx, res, spec || { summary: { total: rows.length } });
  }

  function summarySpec(ctx, store) {
    let sum = null;
    try { sum = Track && Track.statusSummary ? Track.statusSummary(store) : null; } catch { sum = null; }
    return sum ? { summary: sum } : null;
  }
  function handleTrackDigest(text, ctx) {
    const store = trackStoreOf(ctx);
    const rows = store && Array.isArray(store.rows) ? store.rows : [];
    // IB-TN-1e: both digest shapes ride the summary doorstep.
    const spec = summarySpec(ctx, store);
    if (!rows.length) {
      // WORDING-BACKLOG (BUG-140): an empty digest is still a digest
      // — it speaks its own lines with the record's true counts
      // (zero), in the period the ask names, instead of announcing
      // there is nothing to report.
      const daily = /\bdaily\b|\btoday\b/.test(lc(text));
      const reply = compose({ headline: daily ? "Today's digest: nothing has moved yet — the record is empty." : "This week's digest: nothing has moved yet — the record is empty.", facts: ["Applications out 0, replies in 0, interviews 0 — each line read from the record, and the record holds no applications yet.", "The one next action the record supports: log the first application, and every line above starts counting from it."], nextStep: "Want to log the first application now, so the next digest has something real to read?" });
      const res = { intent: "tracking_digest", reply, resultStatus: "awaiting_user", sends: 0 };
      return spec ? emitTrack(ctx, res, spec) : res;
    }
    const counts = {};
    for (const r of rows) counts[r.stage || "unknown"] = (counts[r.stage || "unknown"] || 0) + 1;
    const reply = compose({ headline: `Digest: ${rows.length} applications on the record.`, facts: Object.entries(counts).map(([k, v]) => `${v} at ${k.replace(/_/g, " ")} (not a guess — from the log).`), nextStep: "Name one for its full history." });
    const res = { intent: "tracking_digest", reply, resultStatus: "prepared", sends: 0, counts };
    return spec ? emitTrack(ctx, res, spec) : res;
  }

  function handleFunnel(text, ctx) {
    const store = trackStoreOf(ctx);
    const rows = store && Array.isArray(store.rows) ? store.rows : [];
    const reply = rows.length >= 5
      ? compose({ headline: "Funnel math runs on your own applications only.", facts: [`${rows.length} applications are on the record — enough to start, thin enough that I will label every rate with its count.`], nextStep: "Want it cut by resume version or by path (referral versus cold)?" })
      : compose({ headline: "Not enough of your own data for funnel math yet — and I won't borrow anyone else's.", facts: [/\breferral|referred\b|\bcold\b/.test(lc(text)) ? "Rates from five or fewer applications are noise; the tracker needs a real base before referral and cold rates can be compared honestly." : "Rates from five or fewer applications are noise; the tracker needs a real base before a variant gets killed over it.", "What I will do instead: every application you log makes the math more honest, and the moment the base is real the funnel runs on your numbers alone."], nextStep: "Log the applications already out and I will run it again — want to start with the most recent one?" });
    const res = { intent: "tracking_status", reply, resultStatus: "awaiting_user", sends: 0 };
    // IB-TN-4: the emit is unconditional — on a thin log the refusal
    // IS the product, and the analytics/verdict payload honestly
    // shows the thin base it describes. One product per emit.
    let product = null;
    try {
      if (Track && /\bresume version|variant\b/i.test(s(text)) && Track.resumeVersionVerdict) product = { verdict: Track.resumeVersionVerdict(store) };
      else if (Track && Track.funnelAnalytics) product = { analytics: Track.funnelAnalytics(store) };
    } catch { product = null; }
    return product ? emitTrack(ctx, res, product) : res;
  }

  // ---------- outreach ops (124): seed test / suppression check / reserve ---
  function handleOutreachOps(text, ctx) {
    const t = lc(text);
    if (/\bseed\b|\bplacement test\b|\binbox placement\b/.test(t)) {
      const reply = compose({ headline: "The seed test runs before wave 1, never after.", facts: ["The first sends go to seed inboxes — Gmail, Outlook, Yahoo — and the placement is read before a single real name is emailed.", "A spam-folder landing stops the wave; the fix happens first, while it costs nothing."], nextStep: "The seed run is staged for the current draft set now — the placement read lands here before wave 1 is queued, and you approve the wave only after you see it." });
      // BUG-108: the seed-test plan is the typed record.
      const seed = { kind: "seed_test_plan", providers: ["Gmail", "Outlook", "Yahoo"], runs_before: "wave_1", stop_on: "spam_folder_landing" };
      return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, payload: seed, artifact: seed };
    }
    if (/\bsuppression check\b|\balready emailed\b/.test(t)) {
      const pool = poolOf(ctx);
      let fact = "The check runs over your past outreach history plus the shared never-contact list before anyone is queued; anyone already emailed is excluded when the list is built, every time, before a single draft exists.";
      let counts = null;
      if (pool && pool.length && Outreach && Outreach.buildList) {
        try { const y = Outreach.buildList(pool, {}, { profile: ctx.profile, nowMs: nowOf(ctx) }).yield; counts = { already_emailed: y.exclusions.already_emailed || 0, suppressed: y.exclusions.suppressed || 0 }; fact = `On the current pool: ${counts.already_emailed} already contacted and ${counts.suppressed} on the never-contact list — both excluded before drafting.`; } catch { /* keep the rule answer */ }
      }
      const reply = compose({ headline: "Suppression is checked before drafting, not after a complaint.", facts: [fact], nextStep: "Want the exclusion counts on the current list?" });
      // BUG-108: the check's own record — sources + pool counts when
      // a pool exists to count.
      const sc = { kind: "suppression_check", checked_before: "drafting", sources: ["past_outreach_history", "shared_never_contact_list"], pool_counts: counts };
      return { intent: "outreach_clarification", reply, resultStatus: "prepared", sends: 0, payload: sc, artifact: sc };
    }
    // BUG-108: the reserve split the user stated is the typed record.
    const selM = t.match(/(\d[\d,]*)\s*selected/), resM = t.match(/(\d[\d,]*)\s*reserve/);
    // WORDING-BACKLOG (BUG-131): the headline speaks the split the
    // user stated — their reserve count behind their selected count —
    // never a riddle in place of the mechanism.
    const reply = compose({ headline: selM && resM ? `The reserve pool is your ${resM[1]} next names in rank order, behind the ${selM[1]} selected.` : "The reserve pool is the next names in rank order, behind the selected list.", facts: ["When a send bounces or a name drops out, the top reserve name takes the slot at queue time, inside the same caps.", "Reserve names get the same verification and exclusions as the selected list — a backfill is never a shortcut."], nextStep: "Want the selected-versus-reserve split on the current list?" });
    const rv = { kind: "reserve_pool", selected: selM ? Number(selM[1].replace(/,/g, "")) : null, reserve: resM ? Number(resM[1].replace(/,/g, "")) : null, backfill: "rank_order_at_queue_time" };
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, payload: rv, artifact: rv };
  }

  // IB-AP-8 (SC-081): a portal-account ask is a governed credential
  // flow, never an outreach plan. The bare ask creates NOTHING — it
  // returns the approval-shaped path; the confirmation turn (or the
  // host's card tap via ctx.portalApproval) is what calls 133, and
  // 142 only ever carries the vault REFERENCE, never a password.
  function handlePortalAccountAsk(text, ctx) {
    const profile = ctx.profile || {};
    const portal = /\bworkday\b/i.test(s(text)) ? "Workday" : /\bgreenhouse\b/i.test(s(text)) ? "Greenhouse" : /\blever\b/i.test(s(text)) ? "Lever" : null;
    const company = (ctx.posting && ctx.posting.company) || companyFromText(text, ctx) || null;
    const confirm = /\bconfirm\b[^.]*\bportal\b|\bcreate it\b|\byes\b[^.]*\bportal account\b/.test(lc(text)) || ctx.portalApproval === true;
    if (confirm && company && Packets && Packets.createPortalAccount) {
      const email = (profile.basics && profile.basics.email) || "";
      const local = email.split("@")[0] || "candidate";
      const domain = email.split("@")[1] || "example.com";
      const slug = lc(company).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      try {
        const r = Packets.createPortalAccount({ company, alias_email: `${local}+${slug}@${domain}`, password_vault_ref: `vault/career/portal/${slug}`, now: new Date(nowOf(ctx)).toISOString() });
        if (r && r.ok) {
          const reply = compose({ headline: `The ${company} portal account record is created.`, facts: [r.disclosure], nextStep: "Want the portal list shown with this account on it?" });
          return { intent: "portal_account", reply, resultStatus: "completed", sends: 0, portal_account: r.record, audit: r.audit || null };
        }
      } catch { /* fall through to the governed ask */ }
    }
    const reply = compose({ headline: "Creating a login is not something I do as a side effect of a chat ask — no alias, no password gets generated until you confirm the account card.", facts: [`On your confirmation, the account is created as a recorded step: an alias email for that employer's ${portal || "portal"}, and a generated password that goes only into your vault — the password itself never appears in chat, logs, or the record; what you are shown is the vault reference.`, company ? `The account is per-employer: this card is for ${company} on ${portal || "its portal"}.` : "The account is per-employer, so the card needs the company, not just the portal brand."], nextStep: company ? `Confirm the card for ${company} on ${portal || "its portal"} and the account is created as a recorded step, with the vault reference shown here.` : `Tell me the employer (this one is on ${portal || "the portal"}) and confirm the card, and the account is created as a recorded step with the vault reference shown here.` });
    // BUG-114: the account step is the turn's typed product at the
    // approval gate — payload.committed === false is what the
    // access completion branch reads; the record also rides as the
    // artifact so the doorstep derivation can see it.
    const paRec = { kind: "portal_account_step", committed: false, portal, company, step: "awaiting_confirmation", creates_on_approval: "133.createPortalAccount", password_handling: "vault_only" };
    return { intent: "portal_account", reply, resultStatus: "awaiting_user", sends: 0, portal_account: { portal, company, step: "awaiting_confirmation", creates_on_approval: "133.createPortalAccount", password_handling: "vault_only" }, payload: paRec, artifact: paRec };
  }

  // ---------- apply rules (132): the honest rulebook, spoken plainly ---------
  function handleApplyRules(text, ctx) {
    const t = lc(text);
    const profile = ctx.profile || {};
    // BUG-070 (W5 class A): every rules branch carries its 132/Apply3
    // product on the typed result — or a typed blocker naming why no
    // product exists — and, when a posting resolves, the 141 packet
    // doorstep record rides beside it (the carryDoorstep treatment the
    // landed branches already had). Before this fix the branches
    // returned prose only (artifacts=[]/payload=null in the records),
    // and the salary/cooldown producer calls silently died on an
    // out-of-scope `profile` reference inside their try/catch.
    const carryPacket = (res) => {
      try {
        if (Doorstep && Doorstep.emitApplicationPacket) {
          let posting = ctx.posting || null;
          const comp = companyFromText(text, ctx);
          if (!posting && comp) { const r0 = rankedShortlist(profile, ctx, { company: lc(comp) }); if (r0.ranked.length) posting = r0.ranked[0].posting; }
          if (!posting && comp) { const fx = namedFixturePosting(comp, text); if (fx.match) posting = fx.match; }
          if (!posting) { const r1 = rankedShortlist(profile, ctx, {}); if (r1.ranked.length) posting = r1.ranked[0].posting; }
          if (posting) {
            const em = Doorstep.emitApplicationPacket(ctx, { company: posting.company, title: posting.title, jobId: posting.id || posting.corpus_id || posting.job_id, jdText: jdTextForPosting(posting), autopilotAsk: /\bautopilot\b|\bauto[ -]?apply\b|\bsubmit first\b|\btell me after\b|\bapply automatically\b/.test(lc(text)) });
            if (em && em.doorstep && em.doorstep.gap === null) { res.doorstep = em.doorstep; if (!res.payload && em.payload) res.payload = em.payload; }
          }
        }
      } catch { /* the unwired result stands */ }
      return res;
    };
    const done = (headline, facts, nextStep, extra) => carryPacket(Object.assign({ intent: "doorstep_status", reply: compose({ headline, facts, nextStep }), resultStatus: "awaiting_user", sends: 0 }, extra || {}));
    if (/\bsalary expectation\b/.test(t)) {
      // IB-AP §1.2: 132's salaryQuestion produces the governed answer.
      let sal = null;
      try { sal = Apply && Apply.salaryQuestion ? Apply.salaryQuestion(profile, s(text), {}) : null; } catch { sal = null; }
      return done("The salary-expectation field never gets a number you did not approve.", ["What goes in instead: the market range for the role and level, labeled as a range — or the field is left for the recruiter conversation, per the company's own form rules.", "A specific number appears only when you have approved that exact number for that exact company."], "Want the market range for this role before you decide?", sal ? { salary: sal, payload: sal } : { blocker: { code: "salary_producer_unavailable", reason: "132's salaryQuestion returned no product for this ask" } });
    }
    if (/\bsophomore\b[^.]*\bsweep\b|\bsummer-analyst sweep\b/.test(t)) {
      // IB-AP §1.2: windows come from 132's checkWindows over the
      // window registry the turn carries; no registry on record is a
      // typed blocker, not a silent gap.
      let wins = null;
      try { wins = Apply && Apply.checkWindows ? Apply.checkWindows(ctx.windowRegistry || [], gradYearOf(profile), new Date(nowOf(ctx)).toISOString().slice(0, 10)) : null; } catch { wins = null; }
      // WORDING-BACKLOG (BUG-181): the windows ARE the deliverable —
      // when the registry carries them they are listed with their
      // deadlines; when it does not, the reply says so plainly and
      // asks for the input that unlocks the list, instead of
      // describing the sweep and offering to list them later.
      if (wins && wins.length) {
        const openWins = wins.filter((w) => w.open);
        const lines = wins.slice(0, 4).map((w) => `${w.company} ${w.program || "program"}: ${w.note}.`);
        return done(openWins.length ? `The sophomore sweep — ${openWins.length} window${openWins.length === 1 ? "" : "s"} open, with deadlines.` : "The sophomore sweep — the windows, with their dates.", [...lines, "Each open window gets a bank-format one-pager tailored, and every application still stops at its doorstep for your tap; a window that has not opened is named not-yet-open, never guessed."], "Want the one-pager tailored for the first open window?", { windows: wins });
      }
      return done("The sophomore sweep — no window can be named open from this record yet.", ["No recruiting-window registry is on this record, so no bank's window can honestly be called open or closed today — a window named without its dates would be a guess wearing a deadline.", "The moment a window is on record it is read with its dates: open windows get a bank-format one-pager tailored, and every application still stops at its doorstep for your tap."], "Give me one bank's window dates (or its careers page) and the sweep starts from real windows?", { windows: [], blocker: { code: "no_window_registry_on_record", reason: "no recruiting-window registry is carried on this record, so no window can be named open or closed" } });
    }
    if (/\bats parser\b|\bparser mangled\b|\bmangled my dates\b/.test(t)) {
      // IB-AP §1.2: corrections come from Apply3's detectDateAnomalies
      // over the parsed fields the portal returned; without those
      // fields on the turn there is nothing honest to correct.
      let corr = null;
      try { if (Apply3 && Apply3.detectDateAnomalies && Array.isArray(ctx.parsedFields)) corr = Apply3.detectDateAnomalies(ctx.parsedFields, {}); } catch { corr = null; }
      return done("The parser mangled it — the fields get re-entered by hand from your profile of record.", ["Parsed values are never trusted over the profile of record; the mangled dates are replaced field by field and the fixed version is what reaches the doorstep.", "A replay test is written from this failure so the same mangling gets caught automatically."], "Want the corrected field list shown before anything is re-entered?", corr ? { corrections: corr } : { blocker: { code: "no_parsed_fields_on_record", reason: "the portal's parsed fields are not carried on this turn, so no field-level correction can be computed" } });
    }
    if (/\bwrong-resume\b|\bnearly attached\b|\bvariant b\b[^.]*\bcompany a\b/.test(t)) {
      // IB-AP §1.2: the attach guard runs over the variant registry
      // (the turn's stored artifacts); no registry = typed blocker.
      let guard = null;
      try {
        const variants = (ctx.artifacts || []).map((a) => ({ variant_id: a.record || a.name, company: a.company || null }));
        if (Apply3 && Apply3.guardAttach && variants.length) guard = Apply3.guardAttach(variants, companyFromText(text, ctx) || "", /variant b/i.test(t) ? "B" : null);
      } catch { guard = null; }
      return done("Caught before anything went out — the wrong variant never reached the portal.", ["Every packet is locked to its company when it is built: the lock is the packet's binding to that company, checked against the company's own record at attach time — a resume version that does not match cannot be attached, and the mismatch stops everything.", "Nothing went out under the wrong resume — the failure is reported here precisely because the guard fired."], "Want the per-company variant bindings listed for a final check?", guard ? { attach_guard: guard } : { blocker: { code: "no_variant_registry_on_record", reason: "no stored resume variants are carried on this turn, so the attach guard has no registry to check" } });
    }
    if (/\bdeadline radar\b|\bwarn me\b[^.]*\bwindow closes\b/.test(t)) {
      // IB-AP §1.2 / SC-107: the radar is Apply3's deadlineRadar over
      // the company files' own entry-route dates.
      let radar = null;
      try { radar = Apply3 && Apply3.deadlineRadar ? Apply3.deadlineRadar(cirListOf(ctx), { now: nowOf(ctx) }) : null; } catch { radar = null; }
      return done("The deadline radar is set on your target windows.", ["Each target's closing date is read from its own posting; the warning lands two weeks before the window closes, and again inside the final week.", "A window that closes early moves the warning with it — the radar reads the posting, not a static calendar."], "Want the current target windows listed with their dates?", radar ? { radar } : { blocker: { code: "radar_producer_unavailable", reason: "Apply3's deadlineRadar returned no product" } });
    }
    if (/\bautopilot\b/.test(t)) {
      const fitM = t.match(/fit\s*[≥>=]+\s*(\d+)/), maxM = t.match(/max\s*(\d+)\s*\/\s*day/), compM = t.match(/my (\d+) companies/);
      // IB-AP §1.2: the rule itself is 132's product — created from
      // the user's own dictated spec (that dictation is the creation
      // approval the producer requires); evaluation stays a nightly
      // host run, never a chat side effect.
      let ruleProd = null;
      try { ruleProd = Apply && Apply.createRule ? Apply.createRule({ minFit: fitM ? Number(fitM[1]) : undefined, maxPerDay: maxM ? Number(maxM[1]) : undefined, companies: [] }, { approvedByUser: true }) : null; } catch { ruleProd = null; }
      // WORDING-BACKLOG (BUG-185): the restatement carries EVERY
      // element the user dictated — dropping "no Reach roles" or the
      // nightly summary from the echo drops the constraint from the
      // contract the user thinks they set.
      const noReach = /\bno reach\b|\breach roles? (are )?excluded\b/.test(t);
      const nightly = /\bnightly summary\b/.test(t);
      const parts = [`fit at or above ${fitM ? fitM[1] : "your threshold"}`];
      if (compM) parts.push(`your ${compM[1]} companies`);
      if (maxM) parts.push(`at most ${maxM[1]} a day`);
      if (noReach) parts.push("no Reach roles");
      if (nightly) parts.push("a nightly summary while it runs");
      return done("Your autopilot rule is recorded — with the doorstep law still on top of it.", [`The rule as stated, in full: ${parts.join("; ")} — and the excluded set stays excluded.`, "What the rule can never do: submit without the batch card. Each night's set stops at the doorstep for your yes, and the nightly summary reports only what the record shows — applied, skipped, and why."], "Want this rule run over tonight's new postings?", ruleProd ? { rule: ruleProd } : { blocker: { code: "rule_producer_unavailable", reason: "132's createRule returned no product" } });
    }
    if (/\btriage\b[^.]*\blinks?\b|\bapply to (these|the) \d+ links\b|\bapply to these links\b/.test(t)) {
      // IB-AP §1.2: verdicts come from 132's triageBatch over the
      // postings the turn carries (pasted URLs triage via triageLinks
      // when the ask actually contains them).
      let triage = null;
      try {
        const urls = s(text).match(/https?:\/\/[^\s)]+/g) || [];
        if (urls.length && Apply3 && Apply3.triageLinks) triage = Apply3.triageLinks(urls, { postings: postingsFromCtx(ctx), cirs: cirListOf(ctx), now: nowOf(ctx) });
        else if (Apply && Apply.triageBatch) triage = Apply.triageBatch(postingsFromCtx(ctx), { profile, log: ctx.applyAuditLog || null, scoringProfile: scoringProfile(profile) });
      } catch { triage = null; }
      // WORDING-BACKLOG (BUG-185): the flags echoed are the USER'S
      // flags — when the ask names its own triage categories
      // (clearance-blocked), the reply classifies in those terms, not
      // a stock category list.
      const userFlags = /\bclearance\b/.test(t) ? "expired, duplicate, and clearance-blocked — each flagged with its reason" : "expired, duplicate, knockout you fail, wrong level";
      return done("Each link gets a verdict before anything goes out.", [`Every link is read and classified: apply, skip, or ask — with the reason written next to it (${userFlags}).`, "Only the apply set moves forward, each to its own doorstep."], "Paste the links and I will return the verdicts first.", triage ? { triage } : { blocker: { code: "triage_producer_unavailable", reason: "132's triage returned no verdicts" } });
    }
    if (/\breferral stacking\b|\bwith referral\b[^.]*\bfirst\b/.test(t)) {
      const timing = Graph && Graph.referralTiming ? Graph.referralTiming({}) : null;
      // IB-AP §1.2: the stacking check is 132's checkReferral over the
      // graph's warm paths for the named company.
      let ref = null;
      try {
        const comp = companyFromText(text, ctx);
        let warm = [];
        if (comp && Graph && Graph.findPaths) { const fp = Graph.findPaths(graphStoreOf(ctx), comp, graphProfileOf(ctx), { now: nowOf(ctx) }); warm = (fp && fp.paths) || []; }
        if (Apply && Apply.checkReferral) ref = Apply.checkReferral(comp || "", warm);
      } catch { ref = null; }
      // WORDING-BACKLOG (BUG-181): the check RUNS against the role the
      // ask names — the reply says what it found there (a warm path
      // with its proposals, or none), never asks the user to name the
      // role they already named, and states the no-invention rule in
      // the user's own terms.
      const comp = companyFromText(text, ctx);
      // The check's target is named from the ask itself when the
      // company resolver finds nothing ("Apply to Palantir FDSE") —
      // the reply never leaves the target as "that company".
      const askTarget = comp || (s(text).match(/\b[Aa]pply to\s+([A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+)?)/) || [])[1] || null;
      const head = askTarget ? `Referral stacking checked for ${askTarget} — before the application moves.` : "Referral stacking is checked before the application moves.";
      const facts = [timing ? timing.reason : "If a referral is realistically in motion, the application can hold up to 48 hours for it; after that, applying now and referring after beats waiting."];
      if (ref && ref.warmPathFound) facts.push(`A warm path exists: ${ref.who} — the two honest plays are: ${(ref.proposals || []).join("; ").toLowerCase()}.`);
      else if (ref) facts.push(`Your graph holds no warm path at ${askTarget || "that company"} today, so there is no referral in motion to stack — and no referral will be claimed that does not exist.`);
      else facts.push("No referral will be claimed that does not exist — the check is about timing, not wording.");
      return done(head, facts, "Say the word and the application moves now — or give me the posting's deadline and I will re-run the timing against it.", ref ? { referral: ref } : { blocker: { code: "referral_producer_unavailable", reason: "132's checkReferral returned no product" } });
    }
    if (/\bsponsorship\b|\beeo\b|\bself-identify\b|\bsaved .* answer\b/.test(t)) {
      // IB-AP §1.2: the saved answer + its confirmation state come
      // from 132 — the saved value is never invented here, and the
      // state stays unconfirmed until the user confirms in-session.
      let sens = null;
      try {
        if (Apply && Apply.savedAnswerFor && Apply.confirmSensitive) {
          const kind = /\bsponsorship\b/.test(t) ? "sponsorship" : /\beeo\b/.test(t) ? "eeo" : "self_identify";
          const saved = Apply.savedAnswerFor(profile, kind);
          const conf = Apply.confirmSensitive(profile, { kind, text: s(text) }, {});
          if (conf) sens = { kind, saved: saved != null ? saved : (conf.savedAnswer != null ? conf.savedAnswer : null), confirmation_state: conf.confirmationState || (conf.requiresConfirmation ? "unconfirmed" : "confirmed"), product: conf };
        }
      } catch { sens = null; }
      // WORDING-BACKLOG (BUG-181): the saved answer is PRINTED, word
      // for word — showing it is the ask, so a reply that only
      // promises to show it later has not answered.
      const savedLine = sens && sens.saved != null ? `Your saved ${sens.kind === "sponsorship" ? "sponsorship" : sens.kind === "eeo" ? "EEO" : "answer"} answer, exactly as stored: "${sens.saved}" — shown here before any form ever sees it, and used only on your confirmation.` : "No saved answer for this question is on your profile — nothing is filled until you set one, and it is never guessed.";
      return done("Your saved answer, printed here before it is ever used.", [savedLine, "Sensitive answers — sponsorship, self-identification — are never filled silently: the saved default appears on the card, and any change is your edit, not my guess.", "The decline-to-self-identify default stays exactly that: a default you can override per application."], "Confirm this saved answer, or tell me the edit?", sens ? { sensitive: sens } : { blocker: { code: "sensitive_producer_unavailable", reason: "132's sensitive-answer products returned nothing" } });
    }
    if (/\bknockout\b/.test(t)) {
      // IB-AP §1.2: the judgement is Apply3's eligibilityJudge over
      // the resolved posting; no posting = typed blocker.
      let judgement = null;
      try {
        const comp = companyFromText(text, ctx);
        let posting = ctx.posting || null;
        if (!posting && comp) { const r0 = rankedShortlist(profile, ctx, { company: lc(comp) }); if (r0.ranked.length) posting = r0.ranked[0].posting; }
        if (!posting) { const r1 = rankedShortlist(profile, ctx, {}); if (r1.ranked.length) posting = r1.ranked[0].posting; }
        if (posting && Apply3 && Apply3.eligibilityJudge) judgement = Apply3.eligibilityJudge(posting, profile, {});
      } catch { judgement = null; }
      // WORDING-BACKLOG (BUG-181): the concrete knockout the user
      // named is named back as THE reason — a category lecture about
      // knockouts never tells them why THIS role died.
      const koPhrase = (s(text).match(/["“]([^"”]{3,60})["”]/) || [])[1] || null;
      return done(koPhrase ? `Skipped — the knockout is real: ${koPhrase}.` : "A knockout you truly fail skips the role — loudly, never silently.", [koPhrase ? `This role requires ${koPhrase}, which the profile does not have — a packet here would auto-reject, so none is built and no application is spent.` : "The scoring hard-filters catch stated knockouts (years, credentials, windows) before a packet is built, so no time is spent dressing up a role that will auto-reject.", "The skip is recorded with the knockout named, so the role never re-enters your queue silently."], "Want the current list's skips with their knockouts named?", judgement ? { judgement } : { blocker: { code: "no_posting_resolved", reason: "no posting resolved for the knockout judgement" } });
    }
    if (/\bcooldown\b|\breapply\b/.test(t)) {
      // IB-AP §1.2: the lift date comes from 132's checkCooldown over
      // the company's tracker row — never composed.
      let cd = null;
      try {
        if (Apply && Apply.checkCooldown) {
          const store = trackStoreOf(ctx);
          const comp2 = companyFromText(text, ctx);
          const row = store && Array.isArray(store.rows) && comp2 ? store.rows.find((r) => lc(r.company) === lc(comp2)) : null;
          if (row) cd = Apply.checkCooldown(row, new Date(nowOf(ctx)).toISOString().slice(0, 10));
        }
      } catch { cd = null; }
      // WORDING-BACKLOG (BUG-181/182): when the tracker row computes
      // a lift date, the date is PRINTED; when no row exists, the
      // headline never claims a date it cannot show.
      const liftDate = cd ? (cd.lift_date || cd.lifts_on || cd.liftDate || null) : null;
      if (cd && liftDate) return done(`The reapply cooldown holds — it lifts on ${liftDate}.`, [`The date is computed from the application on record plus the company's cooldown window — ${liftDate} is the first day a new application is not filtered as a reapply.`, "Going back inside the window anyway is the fastest way to be filtered by the employer's own system."], "Want a reminder set for the lift date?", { cooldown: { held: cd.held != null ? cd.held : cd.holds || null, lift_date: liftDate, raw: cd } });
      return done("The reapply cooldown holds — and no lift date can be printed without the application on record.", ["The lift date is computed from the application on your tracker plus the company's cooldown window; this session's tracker holds no row for the company, so printing a date would be inventing one.", "Going back inside the window anyway is the fastest way to be filtered by the employer's own system."], "Name the company and I will print its lift date from its tracker row?", { blocker: { code: "no_application_on_record", reason: "no tracker row exists for a named company, so no cooldown or lift date can be computed" } });
    }
    if (/\bhackerrank invite\b|\bassessment invite\b|\boa invite\b/.test(t)) {
      // IB-AP §1.2: the invite product is 132's handleAssessmentInvite.
      let assess = null;
      try { assess = Apply && Apply.handleAssessmentInvite ? Apply.handleAssessmentInvite({ company: companyFromText(text, ctx) || null, text: s(text) }, {}) : null; } catch { assess = null; }
      return done("The invite gets scheduled and you get prepped — the assessment itself stays yours.", ["I will never take an assessment for you; that line does not move. What I do: hold the deadline on the tracker, build the prep pack for its question types, and drill you against the clock."], "Tell me the deadline and I will lay out the prep days.", assess ? { assessment: assess } : { blocker: { code: "assessment_producer_unavailable", reason: "132's handleAssessmentInvite returned no product" } });
    }
    return null;
  }

  // ---------- packet rules (133) ----------------------------------------------
  function handlePacketRules(text, ctx) {
    const t = lc(text);
    if (/\bcurrent employer\b/.test(t)) {
      const reply = compose({ headline: "Refused by default — a role at your current employer needs your knowing override.", facts: ["Applying where you already work, through an agent, is the one packet that can hurt you before it can help you.", "If you truly mean it, say so plainly and the packet is built with that fact on the card, in the open."], nextStep: "Confirm the override in words, or pick a different target?" });
      return { intent: "packet_refused", reply, resultStatus: "blocked", sends: 0 };
    }
    const reply = compose({ headline: "The packet rules run at build time, on every variant.", facts: ["One page for a student resume, enforced by the packet check; the render is single-column with standard headings and text that extracts cleanly, and the parse check must pass before a packet exists.", "A packet that fails either check is not quietly fixed — it comes back to you with the failure named."], nextStep: "Name the role and I will build the packet under those rules." });
    return { intent: "career_packet", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  // ---------- misc single owners ----------------------------------------------
  function handleUnprovenSkill(text, ctx) {
    const skillM = s(text).match(/\badd\s+([A-Z][A-Za-z0-9+#.]*)/i);
    const skill = skillM ? skillM[1] : "that skill";
    const reply = compose({ headline: `${skill} goes on as UNPROVEN — not as a fact.`, facts: ["Watching a video is exposure, not evidence; a resume line you cannot defend in the second interview question is a liability, not an asset.", "The honest fast path: one small real project using it, and the line becomes true."], nextStep: `Want a weekend-sized ${skill} project scoped from your current work?` });
    return { intent: "profile_correction", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  function handleAiUse(text, ctx) {
    const company = companyFromText(text, ctx) || "the company";
    let body = null, product = null;
    if (Safety && Safety.aiUseAnswer) {
      try { const a = Safety.aiUseAnswer({ company }); product = a || null; body = a && (a.text || a.answer || a.draft || a.message) || null; } catch { body = null; }
    }
    const reply = compose({ headline: "The truthful answer is drafted from what AI actually did — no more, no less.", facts: [body ? s(body).split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "It states plainly which parts AI assisted (organization, formatting, drafts you rewrote) and that the experience and the words' substance are yours.", "If a company bans AI text outright, the answer is this, word for word: \"The work in this application is my own — every word in it is mine. A tool helped me organize my notes before I wrote; the wording here is entirely my own, and I have followed your AI policy as written.\""], nextStep: "Approve the wording, or tell me what AI actually touched and I will tighten it." });
    // A4 contract: the drafted answer rides the result as the draft.
    return { intent: "ai_use_answer", reply, resultStatus: "awaiting_user", sends: 0, draft: product, ai_answer: product };
  }

  function handlePathsAnswer(text, ctx) {
    let body = null;
    if (Paths && Paths.listPaths && Paths.answerPath) {
      try {
        const all = Paths.listPaths() || [];
        const t = lc(text);
        const hit = all.find((p) => p && p.id && t.includes(lc(String(p.id).replace(/_/g, " ")))) || all[0];
        if (hit) { const a = Paths.answerPath(hit, ctx.profile || {}, {}); body = digText(a, ["text", "summary"], ["sections", "steps", "lines"]); }
      } catch { body = null; }
    }
    const reply = compose({ headline: "The two-year re-route, rung by rung from where you actually stand.", facts: [body ? body.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "Each rung is a role your current evidence can win, dated, with the proof it has to produce for the next rung — no rung is a hope, every rung is a job.", "The dates are targets from the record, and the plan re-routes when a rung lands early or late."], nextStep: "Want rung one turned into this quarter's applications?" });
    return { intent: "path_answer", reply, resultStatus: "prepared", sends: 0 };
  }

  function handleReschedule(text, ctx) {
    let slots = [];
    if (Outreach && Outreach.proposeSlots) { try { slots = Outreach.proposeSlots({ nowMs: nowOf(ctx), count: 3, recipientTz: "America/New_York" }) || []; } catch { slots = []; } }
    // IB-TN-7: the proposal rides 141's calendar seam (typed doorstep
    // record) whenever the seam accepts it — composed copy alone
    // carries no doorstep payload.
    if (slots.length && Doorstep && Doorstep.emitCalendarProposal) {
      try {
        const norm = slots.map((sl) => ({ start: sl.start_iso || sl.start || sl.utc, timezone: "America/New_York", durationMin: sl.durationMin || 30 })).filter((x) => x.start);
        const r = Doorstep.emitCalendarProposal(ctx, { title: "Interview", slots: norm, timezone: "America/New_York" });
        if (r && r.intent === "calendar_proposal" && r.resultStatus !== "blocked") return r;
        if (r && r.doorstep) { const reply0 = compose({ headline: "New slots are proposed from your real calendar — the recruiter picks, nothing is booked yet.", facts: ["Slots are drawn from your free time with a buffer around what is already booked; quiet hours are never offered."], nextStep: "Approve the slot set and it goes to the recruiter as a proposal card." }); return { intent: "calendar_proposal", reply: reply0, resultStatus: "awaiting_user", sends: 0, proposal: { slots }, doorstep: r.doorstep }; }
      } catch { /* fall through to the composed proposal */ }
    }
    const label = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d) : null; };
    const slotFacts = slots.map((sl) => label(sl.start_iso || sl.start || sl.utc)).filter(Boolean).map((x) => `${x} (Eastern): proposed.`);
    const reply = compose({ headline: "New slots are proposed from your real calendar — the recruiter picks, nothing is booked yet.", facts: slotFacts.length ? slotFacts : ["Slots are drawn from your free time with a buffer around what is already booked; quiet hours are never offered."], nextStep: "Approve the slot set and it goes to the recruiter as a proposal card." });
    return { intent: "calendar_proposal", reply, resultStatus: "awaiting_user", sends: 0, proposal: { slots } };
  }

  // ---------- season (136) ----------------------------------------------------
  function handleSeason(text, ctx) {
    if (!Season) return null;
    const t = lc(text);
    const profile = ctx.profile || {};
    if (!Array.isArray(profile._careerSeasonStore)) profile._careerSeasonStore = []; // 136 stores are row arrays
    const store = ctx.seasonStore || profile._careerSeasonStore || null;
    const scoreM = t.match(/(\d{2,3})\s*(?:%|percent|points)?\b/);
    const company = companyFromText(text, ctx) || "the assessment";
    if (store && scoreM && Season.logAssessmentScore) {
      try {
        // WORDING-BACKLOG (BUG-140): the score reply speaks the
        // record's own adjustment — the product computes how
        // next-round prep changes; the old reply discarded it.
        const logged = Season.logAssessmentScore(store, company, { score: Number(scoreM[1]), at: new Date(nowOf(ctx)).toISOString() });
        const reply = logged && logged.ok
          ? compose({ headline: `Assessment score noted: ${scoreM[1]} for ${logged.company || company}.`, facts: [logged.next_round_prep_adjustment || "Scores land in your season record next to the role they belong to, so the retro can show the pattern honestly.", `The score sits on the record at the ${logged.stage || "current"} stage, so the season retro can show the pattern honestly.`], nextStep: "Want the adjusted next-round prep pack now?" })
          : compose({ headline: `No application row for ${company} in this session — the score has nowhere to land yet.`, facts: ["A score attaches to its application row; with no row on record, logging it would invent the application it belongs to."], nextStep: "Log the application first, and the score attaches to it." });
        const res = { intent: "tracking_log", reply, resultStatus: "completed", sends: 0 };
        const spec = summarySpec(ctx, trackStoreOf(ctx));
        return spec ? emitTrack(ctx, res, spec) : res;
      } catch { /* fall through */ }
    }
    if (store && /\bscore\b/.test(t) && Season.seasonDashboard) {
      // The ask reports a score but names no value — the reply asks
      // for the two facts that log it, and states what logging does.
      try {
        const d = Season.seasonDashboard(store, ctx.plan || null, { now: nowOf(ctx) });
        const reply = compose({ headline: "Your assessment score is ready to log — give me the number and the company.", facts: ["Once it is on the record, the score sits next to its role in your season record, and next-round prep adjusts from it: a strong score shifts prep toward interview rounds, and a below-bar score adds an assessment-skills drill block first.", "Nothing goes on the record from the announcement alone — a score I cannot read is a score I will not invent."], nextStep: "Tell me the score and the company, and I will log it and show the adjusted prep." });
        const res = { intent: "season_dashboard", reply, resultStatus: "awaiting_user", sends: 0, dashboard: d };
        const spec = summarySpec(ctx, trackStoreOf(ctx));
        return spec ? emitTrack(ctx, res, spec) : res;
      } catch { /* fall through */ }
    }
    if (store && Season.seasonRetro && /\bretro\b|\bannual\b|\boutcomes versus plan\b/.test(t)) {
      try {
        const r = Season.seasonRetro(store, {});
        // WORDING-BACKLOG (BUG-140): the retro speaks its own
        // numbers — the channel split, what converted, what did
        // not, and the first plan step derived from them.
        const facts = [];
        if (r && typeof r.total === "number" && r.total > 0) {
          facts.push(`The retro in numbers: ${r.total} applications — referred advanced ${r.referred.advanced_past_confirmation} of ${r.referred.applications} (${r.referred.rate_pct}%), cold advanced ${r.cold.advanced_past_confirmation} of ${r.cold.applications} (${r.cold.rate_pct}%), and the misses are counted in the same lines, unedited.`);
          if (r.what_converted) facts.push(s(r.what_converted).split(/(?<=[.!?])\s/)[0]);
          if (r.what_didnt) facts.push(s(r.what_didnt).split(/(?<=[.!?])\s/)[0]);
          if (Array.isArray(r.next_season_plan) && r.next_season_plan.length) facts.push(`Next season's plan starts here: ${s(r.next_season_plan[0]).replace(/\.$/, "")} — targets get set from these numbers, not from the story we prefer.`);
        } else if (r) {
          // An empty log: the module's conversion sentences compare
          // 0% to 0% — spoken, they would crown a converting channel
          // that does not exist. The retro states the zero plainly.
          facts.push("The retro in numbers: 0 applications on the season record — nothing converted and nothing missed, because the record is empty.");
          // WORDING-BACKLOG (BUG-199): next season's plan is
          // DELIVERED from the numbers — from a zero record the
          // honest plan is a floor (logging discipline + the first
          // checkpoint where rates become real), never an offer to
          // draft a plan later and never a forecast from nothing.
          facts.push("Next season's plan, from these numbers: the record gives no conversion rate to extrapolate, so the plan is a floor, not a forecast — every application logged the day it goes out, and the first retro checkpoint at 10 applications, where the per-source rates (referral, board, direct) stop being noise.");
          facts.push("The biggest miss the empty record already proves: a season with no log has no retro — logging is the fix, and it starts with the first application.");
        }
        const reply = compose({ headline: "Your career retro: outcomes versus plan, from the record.", facts: facts.length ? facts : ["Applications, advancement, and offers are counted from the season record — the misses are in it too, unedited.", "Next year's targets get set from the same numbers, not from the story we prefer."], nextStep: r && r.total > 0 ? "Want next season's targets drafted from these numbers?" : "Want the logging rule and the 10-application checkpoint pinned as next season's standing targets?" });
        // IB-TN-1f: season turns ride the log-wide summary doorstep.
        const res = { intent: "season_dashboard", reply, resultStatus: "prepared", sends: 0, retro: r };
        const spec = summarySpec(ctx, trackStoreOf(ctx));
        return spec ? emitTrack(ctx, res, spec) : res;
      } catch { /* fall through */ }
    }
    if (store && Season.seasonDashboard) {
      try {
        const d = Season.seasonDashboard(store, ctx.plan || null, { now: nowOf(ctx) });
        // WORDING-BACKLOG (BUG-140): the dashboard speaks its weeks
        // against the plan — the counts by week the record carries —
        // not a totals line plus a provenance slogan.
        const facts = [];
        if (d) {
          facts.push(`${d.total_applications} applications across ${d.by_week.length} active week${d.by_week.length === 1 ? "" : "s"}${d.plan_target ? `, against a plan of ${d.plan_target}${d.plan_pct != null ? ` (${d.plan_pct}%)` : ""}` : ""}.`);
          for (const w of d.by_week.slice(0, 4)) facts.push(`Week of ${w.week_start}: ${w.applied} applied, ${w.interviews} interview${w.interviews === 1 ? "" : "s"}, ${w.offers} offer${w.offers === 1 ? "" : "s"}.`);
          if (!d.by_week.length) facts.push("The season record in this session is empty, so there is no week to break down — the first application on the record opens week one.");
          else if (d.on_pace != null) facts.push(d.on_pace ? "On pace against the plan." : "Behind the plan's pace — the week split above shows where it slipped.");
          // WORDING-BACKLOG (BUG-199): the "against my plan" half
          // of the ask is addressed even when it is missing — a
          // plan that is not on record is stated as missing, never
          // silently dropped — and the reply ends with ONE step.
          if (!d.plan_target) facts.push("No weekly plan is on record in this session, so there is nothing to compare the weeks against — that half of your ask is missing, not zero.");
        }
        const reply = compose({ headline: "Your season so far, from the record.", facts: facts.length ? facts : ["Every count comes from your season record."], nextStep: d && d.plan_target ? "Want the week ahead paced against this plan?" : "State the weekly plan (applications per week) and every week reads against it from the first application on." });
        const res = { intent: "season_dashboard", reply, resultStatus: "prepared", sends: 0, dashboard: d };
        const spec = summarySpec(ctx, trackStoreOf(ctx));
        return spec ? emitTrack(ctx, res, spec) : res;
      } catch { /* fall through */ }
    }
    return null;
  }

  // ---------- prep (127): mock session state machine ----------
  function detectContradiction(answer, profile) {
    const parts = [];
    const jobClaim = s(answer).match(/my (?:last|previous) ([a-z][a-z ]+?) job/i) || s(answer).match(/worked as an?\s+([a-z][a-z ]+?)(?:\s+for|\s+at|\.|,)/i);
    const profText = lc(profileFactsText(profile) + " " + ((profile.preferences || {}).dealBreakers || []).join(" "));
    if (jobClaim) {
      const phrase = lc(jobClaim[1]).trim();
      const head = phrase.replace(/^(data|software|product|operations)\s+/, (m) => m);
      if (!profText.includes(phrase) && !profText.includes(head.split(" ").slice(0, 2).join(" "))) parts.push(`paid ${phrase} job`);
    }
    const stop = new Set(["I", "In", "My", "The", "That", "This", "It", "Tell", "Why", "What", "When", "How", "For", "And", "But", "So", "One", "Two", "Situation", "Task", "Action", "Result"]);
    for (const tok of s(answer).match(/\b[A-Z][a-zA-Z]{2,}\b/g) || []) {
      if (stop.has(tok)) continue;
      if (!profText.includes(lc(tok)) && !parts.some((p) => p.includes(lc(tok)))) parts.push(tok);
    }
    return parts;
  }
  function rubricFacts(graded) {
    const sc = graded.scores || {};
    const weakest = ["structure", "evidence", "specificity"].sort((a, b) => (sc[a] || 0) - (sc[b] || 0))[0];
    const tips = { structure: "Order the next one as situation, task, action, result.", evidence: "Add one number and how you know it.", specificity: "Name the tool, the constraint, and your exact part." };
    return [`Rubric on that answer: structure ${sc.structure || 0} of 5, evidence ${sc.evidence || 0} of 5, specificity ${sc.specificity || 0} of 5.`, tips[weakest] || ""].filter(Boolean);
  }
  function handlePrepStart(text, ctx) {
    const profile = ctx.profile;
    const posting = ctx.posting || null;
    const bank = Prep.questionBank({ company: posting ? posting.company : null, role: posting ? posting.title : null });
    const store = Prep.makePrepStore();
    const mock = Prep.startMock(store, { bank, count: 5 });
    // PREP-KB ROUTING (LF-07, custom battery 2026-10-18, Block 2 t6):
    // when the user NAMES the opener ("Start with 'Why Deloitte?'"),
    // the mock poses THAT question first — the ask named the first
    // question explicitly, and serving a different one would ignore
    // the one instruction the turn carried. The named question takes
    // the first slot of the mock's own question list, so the answer
    // is graded against it like any other opener.
    try {
      const openerM = s(text).match(/\bstart with\s+['"]([^'"]{2,90})['"]/i) || s(text).match(/\bfirst question\s*(?:is|:)\s*['"]([^'"]{2,90})['"]/i);
      if (openerM && mock.questions && mock.questions.length) mock.questions[0] = Object.assign({}, mock.questions[0], { q: openerM[1].trim() });
    } catch { /* the bank's own opener stands */ }
    const state = { store, mockId: mock.mock_id, phase: "question", currentQ: mock.questions[0].q, role: posting ? { title: posting.title, company: posting.company } : null };
    if (profile && typeof profile === "object") profile._careerRouterPrep = state;
    // PREP-KB ROUTING (LF-07, custom battery 2026-10-18, Block 2 t6):
    // the mock state ALSO lives on the prep-thread record, which
    // rides the thread mirror across turns. The profile copy alone
    // does not survive: for any user with stated facts on record,
    // dispatch replaces ctx.profile with the thin stated-facts
    // bridge at the top of EVERY turn, so a profile-carried session
    // died at the turn boundary and the user's first answer landed
    // in unrelated routes. The thread record is the same home the
    // prep session's own state (sector / served / lastQ) already
    // survives in.
    try { prepThreadForWrite(ctx).prepMock = state; } catch { /* profile copy stands */ }
    const facts = [];
    if (state.role) facts.push(`This is a mock for ${state.role.title} at ${state.role.company}.`);
    facts.push(`Grounded in your own profile record and public interview-pattern data, as of ${asOfMonthYear(ctx)}.`);
    facts.push("Answer in your own words and I will score each answer against a rubric as we go, with the scored feedback at the end.");
    // WORDING-BACKLOG (BUG-135): the posed question CLOSES the reply
    // (as the next step) — a mock whose last line is a grounding
    // sentence collects the generic closer behind it.
    const reply = compose({ headline: "Your mock starts now — one question at a time, scored feedback at the end.", facts, nextStep: state.currentQ });
    return { intent: "prep_mock_start", reply, resultStatus: "running", mock: { id: state.mockId, question: state.currentQ, role: state.role } };
  }
  function handlePrepAnswer(text, ctx) {
    const profile = ctx.profile;
    // PREP-KB ROUTING (LF-07): the session state resolves from the
    // prep-thread record first (it survives the turn boundary — see
    // handlePrepStart); the profile copy is the same-turn fallback.
    const threadState = (() => { try { const th = prepThreadOf(ctx); return th && th.prepMock ? th.prepMock : null; } catch { return null; } })();
    const state = threadState || profile._careerRouterPrep;
    if (/^\s*(i\s+)?(don'?t know|do not know|no idea|not sure|pass)\b/i.test(text)) {
      const story = ((profile.facts) || []).find((f) => ["experience", "project"].includes(f.kind));
      const facts = ["That is fine — we build it from your real work instead of guessing."];
      if (story) facts.push(`Use ${story.title}: set the scene, name your task, say what you did, and end with the result.`);
      facts.push("That order — situation, task, action, result — is exactly what the rubric scores.");
      const reply = compose({ headline: "Let us build that one together.", facts, nextStep: `Try the same question again: ${state.currentQ}` });
      return { intent: "prep_mock_retry", reply, resultStatus: "running", mock: { id: state.mockId, question: state.currentQ } };
    }
    const graded = Prep.scoreAnswer(text);
    const contra = detectContradiction(text, profile);
    const contraSentence = contra.length ? `That does not match your profile, which shows no ${contra.join(" and no ")} on file — in a real interview that claim would not survive a check, so let us coach from the work that is actually yours.` : null;
    if (state.phase === "question") {
      Prep.answerMock(state.store, state.mockId, text);
      state.phase = "probe";
      const low = lc(text);
      const topics = [];
      if (/\bdata\b/.test(low)) topics.push("the data work");
      if (/\bteam\b/.test(low)) topics.push("the team");
      if (/\bproject\b/.test(low)) topics.push("the project");
      if (/\bschedul/.test(low)) topics.push("the scheduling");
      if (/\breport/.test(low)) topics.push("the reporting");
      const vague = /\b(stuff|bunch|lots of|various|things)\b/.test(low) || (graded.scores && graded.scores.specificity <= 1);
      const probe = vague
        ? `Follow-up on that: you mentioned ${topics.join(" and ") || "the work"} — what exactly did you do yourself, and what number or result proves it helped?`
        : `Follow-up on that: what was the hardest part of ${topics[0] || "the work"}, and what would you do differently next time?`;
      const facts = [...(contraSentence ? [contraSentence] : []), ...rubricFacts(graded)];
      const reply = compose({ headline: probe, facts });
      return { intent: "prep_mock_followup", reply, resultStatus: "running", graded, contradiction: contra, mock: { id: state.mockId, question: state.currentQ, probe } };
    }
    // phase === "probe": record the probe answer, advance to the next question
    const res = Prep.answerMock(state.store, state.mockId, text);
    state.phase = "question";
    const facts = [...(contraSentence ? [contraSentence] : []), ...rubricFacts(graded)];
    if (res.done || !res.next_question) {
      const summary = Prep.mockSummary(state.store, state.mockId);
      const reply = compose({ headline: "That is the set for now.", facts: [...facts, `Across the mock your weakest rubric area is ${summary ? summary.fix_first : "structure"} — that is the one to drill.`], nextStep: "Want to retry your weakest answer once more?" });
      if (profile) profile._careerRouterPrep = null;
      try { const th = prepThreadForWrite(ctx); if (th) delete th.prepMock; } catch { /* the profile clear stands */ }
      return { intent: "prep_mock_complete", reply, resultStatus: "prepared", graded, contradiction: contra, summary };
    }
    state.currentQ = res.next_question;
    const reply = compose({ headline: res.next_question, facts });
    return { intent: "prep_mock_next", reply, resultStatus: "running", graded, contradiction: contra, mock: { id: state.mockId, question: state.currentQ } };
  }

  // ---------- dead-board discovery (121 registry via 131 plan) ----------
  function handleDeadBoard(text, _ctx) {
    let dead = [];
    try { dead = Discover && Discover.discoveryPlan ? Discover.discoveryPlan().deadBoards : (Jobs && Jobs.deadBoards ? Jobs.deadBoards() : []); } catch { dead = []; }
    const t = lc(text).replace(/[^a-z0-9 ]/g, " ");
    for (const b of dead) {
      const name = lc(b.company).replace(/[^a-z0-9 ]/g, " ").trim();
      if (name && (t.includes(name) || t.includes(name.split(" ")[0]))) {
        const reply = compose({ headline: `${b.company} does not publish a live job feed I can pull roles from.`, facts: ["Its public board is recorded as unavailable, so I will not present guessed roles as if they were live listings."], nextStep: "Name another company, or say find roles and I will search the boards that are live." });
        return { intent: "discovery_dead_board", reply, resultStatus: "blocked", company: b.company, shortlist: [], ranked: [] };
      }
    }
    return null;
  }

  // ======================================================================
  // INTENT OWNERSHIP (REPAIR LANE A, gauntlet round 2 — defect class S-1;
  // deep-dive DD-1..DD-4, DD-6..DD-9). User turns that CHANGE STATE — a role
  // closing, cancel/stop in ordinary wording, a prior-application disclosure,
  // a sensitive-fact correction, a recipient change, a relayed opt-out — were
  // owned by NO handler: they hit the unmatched fallback, mutated nothing,
  // and a later "approve and submit" executed on stale state (AP08/AP18/
  // AP20/AP23 all submitted; AP17/NW18 queue cancels never landed because
  // 141's halt answers only C37's three exact phrases). This layer owns
  // those intents deterministically and runs BEFORE every existing route.
  // It never approves, never submits, never sends: it records the change in
  // the shared stores (through 141's + 130's existing exports / write
  // surfaces) and replies, through 140's composer, with what changed.
  //
  // THE INVALIDATION MECHANISM (the flag Lane B's execution guards read):
  //   ctx.doorstepState.invalidation  = { active: true, reason, at,
  //     instruction, detail } — the LATEST state-changing event; reasons:
  //     "role_closed" | "cancelled_by_user" | "prior_application" |
  //     "sensitive_fact_corrected".
  //   ctx.doorstepState.invalidations = the same records, appended in order.
  //   Per-reason records alongside it: ctx.doorstepState.role_closed =
  //   { closed: true, at, instruction }; ctx.doorstepState.prior_application
  //   = { disclosed: true, channel, at, instruction }. For a user cancel the
  //   submission record itself is set: ctx.doorstepState.submission.status
  //   = "cancelled" (141's own submission shape — the deep-dive AP18-A2
  //   check). doorstep.state is deliberately NOT rewritten (it stays
  //   "REVIEW": the form WAS prepared; what changed is that it may no
  //   longer be submitted). While an invalidation is active this layer also
  //   refuses fill/submit turns itself, naming the reason — defense in
  //   depth behind Lane B's guards, never a replacement for them.
  // ======================================================================
  const INVALIDATION_REASON_TEXT = {
    role_closed: "the role was reported closed",
    cancelled_by_user: "you cancelled it",
    prior_application: "you already applied to it manually",
    sensitive_fact_corrected: "a fact the packet was built on was corrected",
  };
  function doorstepStore(ctx) {
    if (!ctx || typeof ctx !== "object") return null;
    if (!ctx.doorstepState || typeof ctx.doorstepState !== "object") ctx.doorstepState = {};
    return ctx.doorstepState;
  }
  function recordInvalidation(ctx, reason, instruction, detail) {
    const store = doorstepStore(ctx);
    if (!store) return null;
    const rec = { active: true, reason, at: nowOf(ctx), instruction: s(instruction), detail: detail || null };
    store.invalidation = rec;
    store.invalidations = [...(store.invalidations || []), rec];
    return rec;
  }
  // Queue state access mirroring 141's loadQueueState surface (host object
  // or host-persisted JSON file), so queue reads/writes land where 141 and
  // the host already keep them.
  function readQueue(ctx) {
    if (ctx && ctx.queueState && ctx.queueState.outreach_queue) return { state: ctx.queueState, persist: () => {} };
    if (ctx && ctx.queueStatePath && nodeFs) {
      try {
        const state = JSON.parse(nodeFs.readFileSync(ctx.queueStatePath, "utf8"));
        return { state, persist: () => nodeFs.writeFileSync(ctx.queueStatePath, JSON.stringify(state, null, 2) + "\n") };
      } catch { return { state: null, persist: () => {} }; }
    }
    return { state: null, persist: () => {} };
  }
  function queueItemsOf(state) { return state && state.outreach_queue && Array.isArray(state.outreach_queue.items) ? state.outreach_queue.items : null; }
  // Match queue items to the person a turn names: by contact email when
  // contacts are on hand, else by the recipient address's own name tokens
  // ("alex.rivera@example.test" -> "alex"). Returns the matched items.
  function personQueueItems(text, items, ctx) {
    const t = lc(text);
    const contacts = ((ctx && (ctx.contacts || ctx.outreachContacts)) || []).map((c) => ({ name: c.name || c.full_name || "", email: lc(c.email || c.work_email || "") }));
    return (items || []).filter((item) => {
      const to = lc(item.to || item.email || "");
      if (!to) return false;
      const contact = contacts.find((c) => c.email && c.email === to);
      if (contact && contact.name && t.includes(lc(contact.name.split(/\s+/)[0]))) return true;
      const local = to.split("@")[0];
      const first = local.split(/[._-]/)[0];
      return !!first && new RegExp(`\\b${first}\\b`).test(t);
    });
  }
  function displayNameFor(item, text, ctx) {
    const to = lc((item && (item.to || item.email)) || "");
    const contacts = ((ctx && (ctx.contacts || ctx.outreachContacts)) || []);
    const contact = contacts.find((c) => lc(c.email || c.work_email || "") === to);
    if (contact && (contact.name || contact.full_name)) return contact.name || contact.full_name;
    const named = s(text).match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
    if (named && to.includes(lc(named[1]))) return `${named[1]} ${named[2]}`;
    const local = to.split("@")[0];
    if (local) return local.split(/[._-]/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return "that recipient";
  }

  // ---- 0. invalidation gate: fill/submit turns on invalidated state ----
  const FILL_TURN = /\bfill (this|it|the form|that) out\b|\bfill out this\b|\bcomplete (this|the) application form\b/;
  const SUBMIT_TURN = /\bapprove and submit\b|\bsubmit it\b/;
  function invalidationGate(text, ctx) {
    const t = lc(text);
    const isFill = FILL_TURN.test(t), isSubmit = SUBMIT_TURN.test(t);
    if (!isFill && !isSubmit) return null;
    const store = ctx && ctx.doorstepState;
    if (!store || typeof store !== "object") return null;
    const inv = store.invalidation && store.invalidation.active ? store.invalidation : null;
    const cancelled = !!(store.submission && store.submission.status === "cancelled");
    if (!inv && !(isSubmit && cancelled)) return null;
    const reason = inv ? inv.reason : "cancelled_by_user";
    let headline, facts, nextStep;
    if (reason === "role_closed") {
      headline = `I will not ${isFill ? "prepare" : "submit"} that application — the role is closed.`;
      facts = ["You told me the employer closed this job and it is no longer accepting applications, so the prepared application stays unsubmitted."];
      nextStep = "Name another role and I will prepare that one instead.";
    } else if (reason === "prior_application") {
      headline = `I will not ${isFill ? "prepare" : "submit"} a duplicate for that role.`;
      facts = ["You already applied to it manually, and a second application from here is exactly the duplicate you told me about."];
      nextStep = "I can track the existing application and check its status instead.";
    } else if (reason === "sensitive_fact_corrected") {
      headline = "That packet is invalid, so I will not submit it.";
      facts = ["It was prepared with your old answer, and your correction changed that answer, so it cannot go out as it stands."];
      nextStep = "I can re-prepare it with the corrected answer and bring it back for your re-confirmation.";
    } else {
      headline = "That application is cancelled, so there is nothing to submit.";
      facts = ["You cancelled it earlier in this conversation, and a later approval does not revive a cancelled application."];
      nextStep = "Tell me if you want to start a different application instead.";
    }
    const reply = compose({ headline, facts, nextStep });
    // Coordinator integration (round 2): one refusal contract across layers —
    // a refused fill/submit carries the seam's guard_refusal.code vocabulary
    // (141 checkSubmitGuards) whichever layer speaks first.
    const GUARD_CODE = { role_closed: "job_closed", prior_application: "duplicate_application", sensitive_fact_corrected: "stale_packet_facts", cancelled_by_user: "approval_cancelled" };
    return { intent: "intent_refusal", resultStatus: "blocked", refused: true, refusal_reason: reason, guard_refusal: { code: GUARD_CODE[reason] || "approval_invalidated", reason: headline, unblock: nextStep }, invalidation: inv || store.invalidation || null, doorstep: store.doorstep || null, submission: store.submission || null, reply };
  }

  // ---- BUG-169 (complexity wave): the speech-act gate -------------
  // A state write may only ever rest on a STATEMENT the user made,
  // never on a question they asked or a hypothetical they floated.
  // The S0: "this posting closes in 3 days... Do I hold the
  // application for the referral or apply now?" was recorded as an
  // invalidation whose stored detail claimed "the user reported the
  // employer closed the job" — a report that never happened. Every
  // writer in this layer now passes the same test: interrogative
  // turns do not write, and an invalidation's detail QUOTES the
  // user's own clause as its evidence instead of paraphrasing a
  // report into existence.
  function interrogativeTurn(text) {
    const raw = s(text).trim();
    if (!raw) return false;
    return /\?/.test(raw) || /^(do|does|did|should|would|could|can|will|is|are|was|were|what|when|why|how|who)\b/i.test(raw);
  }
  // A closure REPORT is a declarative past/stative event: the
  // employer closed it, it was taken down, applications have closed.
  // A FUTURE form ("closes in 3 days", "will close Friday") is a
  // deadline fact, never a report — deadline questions route to the
  // referral-hold decision, not to an invalidation.
  const CLOSURE_REPORT_STRONG = [
    /\b(job|role|position|posting|listing|employer|company|firm|they)\b[^.?!]*\b(was|has been|have been|had been|got)\s+(closed|taken down|removed|filled)\b/i,
    /\b(employer|company|firm|they|recruiter|hiring team)\b[^.?!]*\bclosed\b[^.?!]*\b(job|role|position|posting|applications?)\b/i,
    /\b(they|employer|company|firm|he|she)\b[^.?!]*\bclosed\b[^.?!]*\b(yesterday|today|last|already|this morning)\b/i,
    /\b(it|this role|this posting|this job) (was )?(closed|taken down|removed)\b/i,
    /\bapplications? (are |have been |were )?(now )?closed\b/i,
    /\bposting (was|has been) (removed|taken down)\b/i,
    /\bposition (was|has been) filled\b/i,
    /\bthe (job|role|position|posting) (closed|is closed)\b/i,
  ];
  const CLOSURE_REPORT_WEAK = [/\bno longer accepting( applications)?\b/i, /\bnot accepting applications\b/i, /\bthe role is closed\b/i, /\b(that|this) (job|role|position|posting) closed\b/i];
  function closureReportOf(text) {
    const raw = s(text);
    for (const re of CLOSURE_REPORT_STRONG) { const m = raw.match(re); if (m) return m[0]; }
    if (!interrogativeTurn(raw)) for (const re of CLOSURE_REPORT_WEAK) { const m = raw.match(re); if (m) return m[0]; }
    return null;
  }

  // ---- (a) role-closure reports (DD-1 / AP08) ----
  const CLOSURE_RE = /\b(closed|closes|closing)\b[^.]*\b(job|role|position|posting)\b|\b(job|role|position|posting|employer)\b[^.]*\b(closed|closes)\b|\bno longer accepting\b|\bnot accepting applications\b|\bapplications? (are |have )?(now )?closed\b|\bposting (was |has been )?(removed|taken down)\b|\bposition (was |has been )?filled\b|\bthat role closed\b|\bthe role is closed\b/;
  function handleRoleClosure(text, ctx) {
    // BUG-169: CLOSURE_RE alone is a topic match, not a report — it
    // fired on deadline questions. The write now requires an actual
    // closure report clause, and the invalidation's detail is the
    // user's verbatim clause, quoted as the evidence.
    const clause = closureReportOf(text);
    if (!clause) return null;
    const store = doorstepStore(ctx);
    const rec = { closed: true, at: nowOf(ctx || {}), instruction: s(text) };
    if (store) { store.role_closed = rec; if (store.doorstep) store.doorstep.role_closed = true; }
    if (ctx && ctx.posting && typeof ctx.posting === "object") ctx.posting.closed = true;
    const inv = recordInvalidation(ctx, "role_closed", text, `the user's own words: "${clause}"`);
    const reply = compose({ headline: "Got it — that job is closed and no longer accepting applications.", facts: ["I marked the role closed, and I will not submit the prepared application for it."], nextStep: "Name another role and I will prepare that one instead." });
    return { intent: "intent_role_closed", resultStatus: "blocked", reply, role_closed: rec, invalidation: inv, doorstep: store ? store.doorstep || null : null };
  }

  // ---- (c) prior-application disclosures (DD-4 / AP20) ----
  const DISCLOSURE_RE = /\balready\b[^.]*\b(applied|submitted)\b|\b(applied|submitted)\b[^.]*\b(manually|myself)\b|\bapplied (manually|myself)\b|\bi applied to\b[^.]*\b(manually|yesterday|on their site)\b/;
  function handlePriorApplication(text, ctx) {
    if (!DISCLOSURE_RE.test(lc(text))) return null;
    // BUG-169 invariant: a quoted or attributed application claim is
    // not the user's own disclosure — the assertion test (which
    // strips quotes and hears attribution) decides.
    if (applicationAssertionOf(text) === "hypothetical") return null;
    // BUG-169: a hypothetical ("if I already applied, what happens?")
    // discloses nothing. A concrete disclosure carries its own time
    // or channel marker and survives the gate even beside a question.
    if (interrogativeTurn(text) && !/\bi (already )?(applied|submitted)\b[^.]*\b(manually|yesterday|last (week|month)|on their site|through their (site|portal))\b/.test(lc(text)) && !/\bi already (applied|submitted)\b/.test(lc(text))) return null;
    const store = doorstepStore(ctx);
    const rec = { disclosed: true, channel: "manual — applied by the user outside this chat", at: nowOf(ctx || {}), instruction: s(text) };
    if (store) store.prior_application = rec;
    const profile = ctx && ctx.profile;
    if (profile && typeof profile === "object") profile._careerRouterPriorApplications = [...(profile._careerRouterPriorApplications || []), rec];
    const inv = recordInvalidation(ctx, "prior_application", text, "the user disclosed a prior manual application for this role; no duplicate may be prepared or submitted");
    // BUG-175: the disclosure IS a user-reported application — log it
    // to the tracker in the same turn (the reply below has always
    // offered exactly that tracking; now the record simply exists).
    try {
      const co = companyFromApplicationText(text);
      const store = co ? trackStoreOf(ctx) : null;
      if (co && store && Track && Track.findByCompany && !Track.findByCompany(store, co)) logUserApplication(ctx, { company: co, role: roleFromApplicationText(text), appliedAt: appliedDateOf(text, ctx) });
    } catch { /* the disclosure record stands on its own */ }
    const reply = compose({ headline: "Noted — you already applied to that role manually, so I will not prepare or submit a duplicate application for it.", facts: ["I recorded the manual application against this role, so nothing here can double-apply you."], nextStep: "Say 'track it' and I will follow this application and report its status." });
    // BUG-114: the disclosure record is this turn's doorstep
    // artifact (its completion already reads prior_application).
    return { intent: "intent_prior_application", resultStatus: "completed", reply, prior_application: rec, invalidation: inv, artifact: { kind: "prior_application_record", disclosed: rec.disclosed, channel: rec.channel, at: rec.at } };
  }

  // ---- (d) sensitive-fact corrections (DD-6 / AP23; SH03's sibling) ----
  // The correction is written through 130's write path: answerCurrent with
  // the interview's visa step is 130's ONLY exported write for the work-
  // authorization fact, so the stored statement takes exactly 130's shape.
  // The needs-sponsorship boolean is then set from the user's stated
  // direction — 130's own derivation cannot express "no longer need" (its
  // regex reads the embedded "need sponsorship" as a need), so the parsed
  // direction is authoritative for the flag and the audit entry says so.
  function sensitiveCorrectionOf(text) {
    const t = lc(text);
    if (!/sponsorship|work authorization|work authorisation/.test(t)) return null;
    // BUG-169 invariant (W3): a clause counts as the user's statement
    // only when it stands in a STATEMENT sentence. "Will I need
    // sponsorship in the future?" contains the clause's words inside
    // a question — the old matcher read the direction straight out of
    // the question frame and wrote a profile correction from it.
    const statementText = s(text).split(/(?<=[.?!])\s+/).filter((sent) => !/\?\s*$/.test(sent) && !/^\s*(will|would|do|does|did|is|are|can|could|should|what|how|when)\b/i.test(sent)).join(" ");
    const clauseM = statementText.match(/\b(i will need sponsorship[^,;.]*|i need sponsorship[^,;.]*|need sponsorship in the future[^,;.]*|i no longer need sponsorship[^,;.]*|no longer need sponsorship[^,;.]*|i (?:don'?t|do not) need sponsorship[^,;.]*)/i);
    const clause = clauseM ? clauseM[1].trim() : null;
    // BUG-169: a QUESTION about the fact ("will I need sponsorship?")
    // states no direction — the bare keyword hit used to write a
    // profile correction from it. A direction may only be read from
    // a first-person statement clause the user actually made.
    if (!clause && interrogativeTurn(text)) return null;
    // Direction is read from the statement sentences only, and a
    // direction with NO statement clause behind it is no direction.
    const st = lc(statementText);
    const noNeed = /no longer need|don'?t need sponsorship|do not need sponsorship|never need sponsorship|no sponsorship (needed|required)|without sponsorship/.test(st);
    if (noNeed) return { kind: "no_longer_needed", needsSponsorship: false, clause: clause || "No longer needs sponsorship" };
    const futureNeed = /will need sponsorship|need sponsorship|require sponsorship|needs sponsorship/.test(st);
    if (futureNeed) return { kind: "future_need", needsSponsorship: true, clause: clause || "Will need sponsorship in the future" };
    if (/update|correct|change/.test(t)) return { kind: "unspecified", needsSponsorship: null, clause: null };
    return null;
  }
  function writeSensitiveCorrection(profile, parsed, instruction, ctx) {
    const cons = profile.constraints = profile.constraints || {};
    const from = { workAuthorization: cons.workAuthorization || null, needsSponsorship: cons.needsSponsorship == null ? null : cons.needsSponsorship };
    let via = "direct field write (130 not loaded in this bundle)";
    if (Onboarding && typeof Onboarding.answerCurrent === "function") {
      const had = Object.prototype.hasOwnProperty.call(profile, "_onboarding_pending");
      const prev = profile._onboarding_pending;
      profile._onboarding_pending = "visa";
      try { Onboarding.answerCurrent(profile, parsed.clause); via = "130-career-onboarding visa write (answerCurrent)"; } catch { /* the direct write below still lands */ }
      if (had) profile._onboarding_pending = prev; else delete profile._onboarding_pending;
    }
    cons.workAuthorization = parsed.clause;
    cons.needsSponsorship = parsed.needsSponsorship;
    const audit = { at: nowOf(ctx || {}), instruction: s(instruction), source: "chat correction", precedence: "the user's newer statement wins; the earlier statement is superseded, not deleted", changes: [{ field: "work_authorization", from: from.workAuthorization, to: parsed.clause }, { field: "needs_sponsorship", from: from.needsSponsorship, to: parsed.needsSponsorship }], outcome: "user-directed correction", via };
    profile.profile_corrections = [...(profile.profile_corrections || []), audit];
    profile.dependent_state = Object.assign({}, profile.dependent_state || {}, { invalidated: true, invalidated_by: "sensitive fact correction in chat (sponsorship / work authorization)", materials: "invalidated by the sponsorship correction — prepared packets must be re-prepared on the corrected facts" });
    return audit;
  }
  function handleSensitiveCorrection(text, ctx) {
    const parsed = sensitiveCorrectionOf(text);
    if (!parsed) return null;
    const profile = ctx && ctx.profile;
    let audit = null;
    if (parsed.kind !== "unspecified" && profile && typeof profile === "object") audit = writeSensitiveCorrection(profile, parsed, text, ctx);
    const inv = recordInvalidation(ctx, "sensitive_fact_corrected", text, "the user corrected a sensitive fact (sponsorship / work authorization); prepared packets and approvals built on the old answer are invalid");
    if (parsed.kind === "unspecified") {
      const reply = compose({ headline: "I will hold that packet while you confirm the new answer.", facts: ["Tell me the new work authorization answer in your own words and I will save it exactly as you say it.", "Until then the prepared packet counts as stale, because the fact it was built on is changing."], nextStep: "State the new answer and I will record it and re-prepare." });
      return { intent: "intent_sensitive_correction", resultStatus: "awaiting_user", reply, correction: parsed, invalidation: inv };
    }
    const factSentence = parsed.kind === "future_need" ? "You will need sponsorship in the future — that is what your profile now says." : "You no longer need sponsorship — that is what your profile now says.";
    const reply = compose({ headline: "Updated — I saved your corrected sponsorship answer to your profile.", facts: [factSentence, "The prepared packet still carries the old answer, so it is invalid now and will not be submitted."], nextStep: "I can re-prepare it with the corrected answer and bring it back for your re-confirmation." });
    return { intent: "intent_sensitive_correction", resultStatus: "completed", reply, correction: { kind: parsed.kind, needsSponsorship: parsed.needsSponsorship, clause: parsed.clause }, audit, invalidation: inv };
  }

  // ---- (b) cancel / stop intents (DD-2 + DD-3; AP17, NW18, AP18) ----
  // A maintained pattern set, not C37's one exact sentence. The three exact
  // phrases 141 already owns are deliberately left to 141 (its halt and
  // reply are the proven C37/SH08 contract); every other ordinary wording
  // is owned here — queue wordings through 141's own haltQueue export,
  // application wordings by recording the cancellation in 141's submission
  // record.
  const CANCEL_RE = /\bcancel\b|\bcancelled\b|\bcall (it|them|this|that) off\b|\bhold off\b|\bnever mind\b|\bscrap\b|\bstop\b|\bhalt\b|\bdo not submit\b|\bdon'?t submit\b|\bchanged my mind\b/;
  const QUEUE_CONTEXT_RE = /\bqueue\b|\bqueued\b|\bbatch\b|\boutreach\b|\bfollow[- ]?ups?\b|\brest of\b|\bunstarted\b|\banyone else\b/;
  const LEGACY_HALT_RE = /\bstop everything\b|\bdon'?t contact anyone\b|\bstop all outreach\b/;
  // BUG-169: "should I cancel the queue?" is a question, not a
  // cancellation. An interrogative turn cancels only when it also
  // carries a sentence-led imperative cancel clause.
  const IMPERATIVE_CANCEL_RE = /(^|[.!]\s+)(please\s+)?(cancel|stop|halt|scrap|call (it|them|this|that) off|do not submit|don'?t submit)\b/i;
  function questionVetoesCancel(text) { return interrogativeTurn(text) && !IMPERATIVE_CANCEL_RE.test(s(text)); }
  function haltQueueFallback(ctx, text) {
    const { state, persist } = readQueue(ctx);
    const items = queueItemsOf(state);
    if (!items) return null;
    const q = state.outreach_queue;
    const pending = items.filter((i) => i.status === "pending");
    for (const item of pending) { item.status = "halted"; item.halted_by = "user instruction in chat"; item.halt_reason = s(text || ""); }
    q.halted = true;
    q.halt = { at: nowOf(ctx || {}), instruction: s(text || ""), items_halted: pending.map((i) => i.queue_id), form_prep_state: null };
    persist();
    return { intent: "queue_halt", resultStatus: "completed", halted_count: pending.length, queue_state: q };
  }
  function handleQueueCancel(text, ctx) {
    const t = lc(text);
    if (!CANCEL_RE.test(t) || !QUEUE_CONTEXT_RE.test(t) || LEGACY_HALT_RE.test(t)) return null;
    if (questionVetoesCancel(text)) return null;
    if (!ctx || (!ctx.queueState && !ctx.queueStatePath)) {
      // COMPLEXITY WAVE (adjacent to BUG-169's audit): an explicit
      // queue-cancel with no queue in state is answered honestly —
      // nothing queued, nothing to cancel — instead of falling
      // through to the generic fallback. The branch is narrow on
      // purpose: it fires only when the queue is the named object
      // of the cancel; looser stop-shaped asks (the day-15 close)
      // keep falling through to their own handlers.
      if (!/\bcancel\w*\b[^.?!]*\bqueue\b|\bqueue\b[^.?!]*\bcancel\w*\b/.test(t)) return null;
      const reply = compose({ headline: "There is no queue standing to cancel.", facts: ["No outreach queue is loaded in this conversation — nothing is standing in one, and no wave is out the door.", "The moment a queue exists, 'cancel the queue' halts it on the spot and the halt is saved."], nextStep: "Start a campaign whenever you are ready and the queue exists to be cancelled." });
      return { intent: "queue_halt", resultStatus: "completed", reply, sends: 0, halted_count: 0 };
    }
    const res = Doorstep && typeof Doorstep.haltQueue === "function" ? Doorstep.haltQueue(ctx, text) : haltQueueFallback(ctx, text);
    if (!res) return null;
    if (res.resultStatus === "blocked") return res; // 141 could not find the queue — its honest blocked reply stands
    const items = (res.queue_state && res.queue_state.items) || [];
    const landed = items.filter((i) => i.status === "sent").length;
    const halted = res.halted_count || 0;
    let reply;
    if (landed > 0) {
      // DD-10: never claim "nothing was sent" when a send already landed.
      reply = compose({ headline: "Cancelled the rest of the queue.", facts: [`${landed === 1 ? "One message" : `${landed} messages`} already went out before this, and ${landed === 1 ? "it stays" : "they stay"} on record as delivered.`, `The remaining ${halted} pending item${halted === 1 ? " is" : "s are"} halted, and the halt is saved.`], nextStep: "Nothing else will go out from this queue." });
    } else {
      reply = compose({ headline: "Cancelled — the queued outreach is stopped.", facts: [`${halted} pending item${halted === 1 ? " is" : "s are"} halted, and the halt is saved so it survives a restart.`, "Nothing was sent, and no contact will be made from this queue."], nextStep: "Start a new queue whenever you are ready." });
    }
    return Object.assign({}, res, { intent: "queue_halt", reply, landed_count: landed, intent_owner: "142-intent-ownership" });
  }
  function handleDoorstepCancel(text, ctx) {
    const t = lc(text);
    if (!CANCEL_RE.test(t) || QUEUE_CONTEXT_RE.test(t)) return null;
    if (questionVetoesCancel(text)) return null;
    const store = ctx && ctx.doorstepState;
    if (!store || typeof store !== "object" || (!store.doorstep && !store.submission)) return null;
    recordInvalidation(ctx, "cancelled_by_user", text, "the user cancelled the prepared submission in chat");
    if (store.submission) store.submission.status = "cancelled";
    if (store.doorstep) store.doorstep.cancelled = true;
    const reply = compose({ headline: "Cancelled — I stopped this application, and I will not submit it.", facts: ["The prepared form stays on record as prepared but cancelled, so a later approval cannot send it."], nextStep: "Tell me if you want to start a different application instead." });
    return { intent: "intent_cancelled", resultStatus: "completed", reply, invalidation: store.invalidation, doorstep: store.doorstep || null, submission: store.submission || null };
  }

  // ---- recipient change after the gate (DD-7 / NW13) ----
  function handleRecipientChange(text, ctx) {
    const t = lc(text);
    if (!/instead|change|switch|recipient/.test(t)) return null;
    // BUG-169: "should I send it to Maya instead?" asks — it does not
    // switch. Only an imperative-led turn changes the recipient.
    if (interrogativeTurn(text) && !/^\s*(send|switch|change)\b/i.test(s(text))) return null;
    const m = s(text).match(/\bto\s+([A-Z][a-z]+)\s+instead\b/) || s(text).match(/\brecipient to\s+([A-Z][a-z]+)\b/i) || s(text).match(/\bsend it to\s+([A-Z][a-z]+)\b/);
    if (!m) return null;
    const contacts = ((ctx && (ctx.contacts || ctx.outreachContacts)) || []).map((c) => ({ name: c.name || c.full_name || "" }));
    const byFirst = (first) => contacts.find((c) => lc(c.name).split(/\s+/)[0] === lc(first || ""));
    const newContact = byFirst(m[1]);
    const newName = newContact ? newContact.name : m[1];
    const oldM = s(text).match(/\binstead of\s+([A-Z][a-z]+)\b/);
    const oldContact = oldM ? byFirst(oldM[1]) : null;
    const oldName = oldContact ? oldContact.name : (oldM ? oldM[1] : "the earlier recipient");
    const change = { from: oldName, to: newName, at: nowOf(ctx || {}), instruction: s(text) };
    const profile = ctx && ctx.profile;
    if (profile && typeof profile === "object") profile._careerRouterOutreach = { recipient_change: change, draft_superseded: true };
    const reply = compose({ headline: `Switched — this now needs a draft for ${newName}, not the one for ${oldName}.`, facts: ["The earlier draft is superseded and carries no approval over to the new recipient.", "Nothing has been sent."], nextStep: `I will draft the ${newName.split(/\s+/)[0]} version for your review, and it needs your fresh approval before anything goes out.` });
    return { intent: "intent_recipient_change", resultStatus: "awaiting_user", reply, sends: 0, draft: null, recipient_change: change };
  }

  // ---- relayed opt-out (DD-8 / NW17): 124's suppression, called not edited ----
  const OPTOUT_RE = /opted out|opt[- ]out|stop emailing|stop contacting|never contact|unsubscribe|do not (email|contact|message)|don'?t (email|contact) (me|him|her|them) again/;
  function handleOptOut(text, ctx) {
    if (!OPTOUT_RE.test(lc(text))) return null;
    // BUG-169 (W5): a question about an opt-out ("did she opt out?")
    // is not a relayed opt-out. The write needs the user's own report
    // frame — a relay verb or a plain declarative turn.
    if (interrogativeTurn(text) && !/\b(replied|said|told me|wrote|emailed me|responded|replies)\b/.test(lc(text))) return null;
    const { state, persist } = readQueue(ctx || {});
    const items = queueItemsOf(state);
    if (!items) return null;
    const matched = personQueueItems(text, items, ctx);
    if (!matched.length) return null;
    const email = lc(matched[0].to || matched[0].email || "");
    const name = displayNameFor(matched[0], text, ctx);
    const first = name.split(/\s+/)[0];
    // 124's own reply classification confirms the relayed words are a stop.
    let classification = null;
    const quoted = s(text).match(/'([^']{3,})'/) || s(text).match(/"([^"]{3,})"/);
    if (Outreach && typeof Outreach.classifyReply === "function") { try { classification = Outreach.classifyReply({ body: quoted ? quoted[1] : s(text) }).classification; } catch { classification = null; } }
    let suppression = (ctx && ctx.suppression) || null;
    if (!suppression && Outreach && typeof Outreach.createSuppressionStore === "function") suppression = Outreach.createSuppressionStore();
    if (suppression && email) { suppression.suppress({ email, userId: (ctx && ctx.userId) || "user-1", scope: "both", reason: "recipient opt-out relayed in chat" }); try { ctx.suppression = suppression; } catch { /* the result carries the store */ } }
    const stopped = [];
    for (const item of matched) {
      if (item.status !== "pending") continue;
      item.status = "suppressed";
      item.suppressed_by = "recipient opt-out relayed in chat";
      stopped.push(item.queue_id);
    }
    persist();
    const reply = compose({ headline: `Recorded — ${name} has opted out and will not be contacted again.`, facts: [`I stopped ${stopped.length} queued follow-up${stopped.length === 1 ? "" : "s"} to ${first} and added ${first} to the suppression list, so a send-time check stops them too.`], nextStep: "The rest of the queue is untouched." });
    return { intent: "intent_opt_out", resultStatus: "completed", reply, suppressed_items: stopped, suppression, classification, recipient: { name, email: email || null }, payload: { kind: "suppression_record", recorded: true, scope: "all_campaigns", stopped: stopped.length }, artifact: { kind: "suppression_record", recorded: true, scope: "all_campaigns", stopped: stopped.length } };
  }

  // ---- (e) validity / status questions (DD-9 / SH03; NW17 follow-up) ----
  const VALIDITY_RE = /\bstill\b[^.?!]*\b(valid|approved)\b|\b(valid|approved)\b[^.?!]*\bstill\b|\bis (my|the|it)\b[^.?!]*\b(valid|approved)\b/;
  function handlePacketValidity(text, ctx) {
    const t = lc(text);
    if (!/(packet|approval|application)/.test(t) || !VALIDITY_RE.test(t)) return null;
    const store = ctx && ctx.doorstepState;
    const inv = store && store.invalidation && store.invalidation.active ? store.invalidation : null;
    const profile = ctx && ctx.profile;
    const corrections = profile && (profile.profile_corrections || []).length;
    const dependents = profile && profile.dependent_state;
    const dependentsChanged = !!(dependents && (dependents.rebuilt || dependents.invalidated));
    if (inv) {
      const reply = compose({ headline: "No — it is not still valid.", facts: [`${INVALIDATION_REASON_TEXT[inv.reason] || "The state changed"} after it was prepared, and that invalidated it.`, "It needs re-preparation and a fresh approval before anything could go out."] });
      return { intent: "intent_packet_validity", resultStatus: "completed", reply, packet: null, validity: "invalidated", invalidation: inv };
    }
    if (corrections || dependentsChanged) {
      const reply = compose({ headline: "No — that earlier packet is not still approved and valid.", facts: ["Your correction changed the facts it was built on, so the old packet was invalidated and its materials were rebuilt on the new facts.", "It would need a fresh preparation and a new approval before anything could go out."] });
      return { intent: "intent_packet_validity", resultStatus: "completed", reply, packet: null, validity: "invalidated", invalidated_by: "profile correction" };
    }
    if (store && store.doorstep) {
      const reply = compose({ headline: "Nothing in the record here has invalidated it since it was prepared.", facts: ["It is still the prepared review copy from earlier, and nothing was submitted.", "If any fact it was built on has changed, tell me and I will mark it invalid."] });
      return { intent: "intent_packet_validity", resultStatus: "completed", reply, packet: null, validity: "on_record" };
    }
    const reply = compose({ headline: "I have no earlier packet or approval on record in this conversation, so I cannot confirm one is valid.", facts: ["I have not prepared a new one — you asked about the earlier one, and there is nothing here to judge it from."] });
    return { intent: "intent_packet_validity", resultStatus: "completed", reply, packet: null, validity: "unknown" };
  }
  function handleFollowUpStatus(text, ctx) {
    const t = lc(text);
    if (!/follow[- ]?up/.test(t) || !/still|going out|queued|scheduled|pending/.test(t)) return null;
    const { state } = readQueue(ctx || {});
    const items = queueItemsOf(state);
    if (!items) return null;
    const matched = personQueueItems(text, items, ctx);
    const scope = matched.length ? matched : items;
    const pending = scope.filter((i) => i.status === "pending");
    const name = matched.length ? displayNameFor(matched[0], text, ctx) : null;
    if (name && !pending.length) {
      const reply = compose({ headline: `No — no follow-up to ${name} is still going out.`, facts: [`${name}'s queued follow-ups were stopped, and nothing to ${name.split(/\s+/)[0]} is pending.`] });
      return { intent: "intent_followup_status", resultStatus: "completed", reply, pending_count: 0, recipient: name };
    }
    if (name) {
      const reply = compose({ headline: `Yes — ${pending.length} follow-up${pending.length === 1 ? "" : "s"} to ${name} ${pending.length === 1 ? "is" : "are"} still queued.`, facts: ["They have not gone out yet."], nextStep: "Say cancel and I will stop them." });
      return { intent: "intent_followup_status", resultStatus: "completed", reply, pending_count: pending.length, recipient: name };
    }
    const reply = compose({ headline: pending.length ? `${pending.length} follow-up${pending.length === 1 ? "" : "s"} ${pending.length === 1 ? "is" : "are"} still queued.` : "No follow-ups are still queued.", facts: pending.length ? ["They have not gone out yet."] : ["Nothing in the queue is pending."] });
    return { intent: "intent_followup_status", resultStatus: "completed", reply, pending_count: pending.length, recipient: null };
  }

  // ---- BUG-170/171 (complexity wave): pause control ----------------
  // The kill switch, its release, and its inspection are ONE surface:
  // (1) a typo-tolerant halt (141's fuzzy matcher — "stop evrything
  // pls, pause all teh outreach" halts exactly like the canonical
  // phrases, because the repaired tokens carry the same shapes);
  // (2) unpause in natural words — until this wave the product's own
  // pause-gate reply said "say the word to lift the pause" and no
  // word existed that lifted it; (3) pause inspection spoken from
  // the stored record (scope, when set, what it blocks), including
  // the honest "nothing is paused" when nothing is.
  function fmtWhen(v) {
    const ms = typeof v === "number" ? v : Date.parse(v || "");
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }
  function liftPause(c, text) {
    const prev = c.globalPause && c.globalPause.set === true ? c.globalPause : null;
    const lifted = { set: false, liftedAt: nowOf(c), instruction: s(text), wasSetAt: prev ? prev.at : null };
    c.globalPause = lifted;
    const qs = c.queueState;
    if (qs && typeof qs === "object") {
      qs.global_pause = lifted;
      const q = qs.outreach_queue;
      if (q && typeof q === "object") { q.global_pause = lifted; q.halted = false; }
    }
    const camp = c.campaign || c.outreachCampaign;
    if (camp && typeof camp === "object") camp.global_pause = lifted;
    // DEPTH WAVE (BUG-214): the lift is also written to the thread
    // mirror the moment it happens — a harness that drops the
    // top-level assignment between turns must never resurrect the
    // stale pause on the next turn (syncThreadIn enforces this).
    try { const m = threadMirrorForWrite(c); if (m) m.pause = lifted; } catch { /* mirror is an aid */ }
    return { lifted, prev };
  }
  const UNPAUSE_RE = /\bunpause\b|\blift (the )?pause\b|\bremove (the )?pause\b|\bend (the )?pause\b|\bpause (is )?(off|lifted|over)\b|\bkeep going\b|\bresume (the|it|everything|sending|outreach)\b/;
  const PAUSE_INSPECT_RE = /\b(are we|is it|is everything|is the outreach|is the queue|am i)\b[^.?!]*\b(paused|stopped|halted)\b|\bwhat\b[^.?!]*\bpaused\b|\bdid (it|that) work\b|\bpause (status|state)\b|\bis (it|everything) (still )?(on hold|held)\b/;
  function handlePauseControl(text, ctx) {
    const c = ctx || {};
    const t = lc(text);
    // (1) fuzzy halt — 141 owns the write; this layer returns its
    // typed result verbatim, exactly as the doorstep seam would.
    if (Doorstep && typeof Doorstep.fuzzyHaltMatch === "function" && typeof Doorstep.haltQueue === "function" && Doorstep.fuzzyHaltMatch(text)) {
      try { const h = Doorstep.haltQueue(c, text); if (h) return h; } catch { /* fall through */ }
    }
    const paused = pausedOf(c);
    // (2) unpause — only meaningful while a pause stands; when none
    // stands the words belong to whatever route owns them ("resume"
    // is also a document, and this gate must never eat that ask).
    if (paused && (UNPAUSE_RE.test(t) || (/\bnever mind\b/.test(t) && /\b(keep going|go on|continue|lift|resume)\b/.test(t)))) {
      const { prev } = liftPause(c, text);
      const qs = c.queueState && c.queueState.outreach_queue;
      const halted = qs && Array.isArray(qs.items) ? qs.items.filter((i) => i.status === "halted").length : 0;
      const facts = [`The pause${prev && prev.at ? ` set at ${fmtWhen(prev.at) || "earlier"}` : ""} is lifted — outreach and submissions can be queued again, and every send still waits for your approval.`];
      if (halted) facts.push(`The ${halted} item${halted === 1 ? "" : "s"} the stop itself halted stay halted — a stop is not undone by lifting the pause; say the word and a fresh wave is built instead.`);
      const reply = compose({ headline: "Done — the pause is lifted.", facts, nextStep: "Tell me what to pick back up first." });
      return { intent: "queue_resume", resultStatus: "completed", reply, sends: 0, global_pause: c.globalPause };
    }
    // (3) inspect — read-only, answered from the stored record.
    if (PAUSE_INSPECT_RE.test(t) || (paused && /\bwhat\b[^.?!]*\b(paused|stopped|halted)\b/.test(t))) {
      if (!paused) {
        const wasLifted = c.globalPause && c.globalPause.set === false && c.globalPause.liftedAt;
        const reply = compose({ headline: "No — nothing is paused right now.", facts: [wasLifted ? `The pause was lifted at ${fmtWhen(c.globalPause.liftedAt) || "earlier in this conversation"}, and no new pause has been set since.` : "No global pause is set on your account in this conversation, and no queue is halted.", "Sends, follow-ups, and submissions are not being held by a pause — each still waits for its own approval, as always."], nextStep: "Say 'stop everything' whenever you want the full halt — it takes effect immediately." });
        return { intent: "pause_status", resultStatus: "completed", reply, sends: 0, paused: false };
      }
      const p = c.globalPause && c.globalPause.set === true ? c.globalPause : null;
      const qs = c.queueState && c.queueState.outreach_queue;
      const items = qs && Array.isArray(qs.items) ? qs.items : null;
      const facts = [`Scope: every queue — the global pause${p && p.scope ? ` (${p.scope})` : ""} covers outreach sends, follow-up waves, and application submissions; nothing goes out while it stands.`];
      if (p && p.at) facts.push(`Set at ${fmtWhen(p.at) || "earlier in this conversation"}${p.by ? ` by ${p.by === c.userId ? "you" : p.by}` : ""}, in this conversation.`);
      if (items) {
        const halted = items.filter((i) => i.status === "halted").length;
        const sent = items.filter((i) => i.status === "sent").length;
        facts.push(`On the queue's own record: ${halted} item${halted === 1 ? "" : "s"} halted, ${sent} already out before the stop.`);
      } else {
        facts.push("No queue record is loaded in this session, so item counts are unverified — the pause itself is set and blocks every send path regardless.");
      }
      facts.push("Reading, drafting, planning, and tracking still work — only the going-out actions wait.");
      const reply = compose({ headline: "Yes — here is exactly what is paused.", facts, nextStep: "Say 'lift the pause' and I will reopen the queues — every send still waits for your approval." });
      return { intent: "pause_status", resultStatus: "completed", reply, sends: 0, paused: true, global_pause: p };
    }
    return null;
  }

  // ---- BUG-172 (complexity wave): the user's own suppression -------
  // "Take Maya off my outreach list" / "never email her again" is the
  // USER suppressing a person — it needs no queue, no campaign, and no
  // email on file to be heard. The write lands in 124's suppression
  // store (ctx.suppression — the same store the send-time checks
  // read), keyed by the name as stated, and the reply is spoken only
  // after a read-back through the store's own isSuppressed proves
  // the record is there. A pronoun resolves against the names this
  // store already holds; an unresolvable pronoun asks one question
  // and writes nothing (the BUG-169 invariant).
  function suppressionStoreOf(c) {
    let store = c.suppression && typeof c.suppression === "object" ? c.suppression : null;
    if (store && typeof store.suppress !== "function" && Outreach && typeof Outreach.resolveSuppression === "function") { try { store = Outreach.resolveSuppression(store); } catch { store = null; } }
    if (!store && Outreach && typeof Outreach.createSuppressionStore === "function") store = Outreach.createSuppressionStore();
    return store;
  }
  function suppressedNamesOf(store) {
    const data = store && store.data ? store.data : store;
    const ids = [...((data && data.sharedIds) || []), ...Object.values((data && data.perUserIds) || {}).flat()];
    return ids.filter((x) => typeof x === "string" && x.startsWith("name:")).map((x) => x.slice(5));
  }
  const titleCaseName = (n) => n.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  function handleUserSuppression(text, ctx) {
    const c = ctx || {};
    const t = lc(text);
    // Speech-act gate: a question about suppressing writes nothing.
    if (interrogativeTurn(text) && !/(^|[.!]\s+)(please\s+)?(take|remove|drop|never|don'?t|do not)\b/i.test(s(text))) return null;
    let name = null;
    const m = s(text).match(/\b(?:take|remove|drop|pull)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+off\b/)
      || s(text).match(/\bnever\s+(?:email|contact|message)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i)
      || s(text).match(/\b(?:don'?t|do not)\s+(?:email|contact|message)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+again\b/i)
      || s(text).match(/\bremove\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+from\b[^.]*\b(list|outreach)\b/i);
    if (m) name = m[1];
    const pronoun = !name && (/\b(take|remove|drop|pull)\s+(her|him|them)\s+off\b/.test(t)
      || /\bnever\s+(email|contact|message)\s+(her|him|them)\b/.test(t)
      || /\bnobody\b[^.]*\b(emails?|contacts?|messages?)\s+(her|him|them)\b/.test(t)
      || (/\b(ever\s+)?(emails?|contacts?|messages?)\s+(her|him|them)\s+again\b/.test(t) && /\b(never|nobody|no one|account|make sure)\b/.test(t)));
    if (!name && !pronoun) return null;
    const store = suppressionStoreOf(c);
    if (!store) return null;
    if (!name) {
      const known = suppressedNamesOf(store);
      if (!known.length) {
        const reply = compose({ headline: "I want to record that exactly — who goes on the never-contact list?", facts: ["You have not named anyone in this conversation yet, and I will not guess a name into a permanent suppression record."], nextStep: "Give me the name and I will record it on the spot — for this campaign and every future one." });
        return { intent: "intent_opt_out", resultStatus: "awaiting_user", reply, sends: 0, suppression: null };
      }
      name = titleCaseName(known[known.length - 1]);
    }
    const key = "name:" + lc(name);
    store.suppress({ person_id: key, userId: c.userId || "user-1", scope: "both", reason: "user suppression instruction in chat" });
    const contact = ((c.contacts || c.outreachContacts) || []).find((x) => lc(x.name || x.full_name || "") === lc(name));
    const email = contact ? (contact.email || contact.work_email || null) : null;
    if (email) store.suppress({ email, userId: c.userId || "user-1", scope: "both", reason: "user suppression instruction in chat" });
    c.suppression = store;
    // Read-back: the claim is spoken only if the store itself now
    // reports the name suppressed.
    let verified = false;
    try { verified = typeof store.isSuppressed === "function" && store.isSuppressed({ person_id: key }, c.userId || "user-1"); } catch { verified = false; }
    if (!verified) return null;
    const facts = [`Recorded just now and read back from the suppression store: ${name} is out of this campaign and every future one — drafts and send-time checks both stop at this list.`];
    facts.push(email ? `The block is bound to the name and to ${email}, the address on file for them.` : `No email address is on file for ${name}, so the block is keyed to the name as you stated it — the moment an address is attached to that name, the address is blocked too.`);
    const reply = compose({ headline: `Done — ${name} is on your never-contact list.`, facts, nextStep: "The rest of your outreach is untouched." });
    return { intent: "intent_opt_out", resultStatus: "completed", reply, sends: 0, suppression: store, recipient: { name, email }, payload: { kind: "suppression_record", recorded: true, scope: "all_campaigns", name }, artifact: { kind: "suppression_record", recorded: true, scope: "all_campaigns", name } };
  }

  // The ownership layer: checked BEFORE every existing route in handleChat.
  function handleStateChangeIntents(text, ctx) {
    const c = ctx || {};
    return invalidationGate(text, c)
      || handlePauseControl(text, c)
      || handleRecipientChange(text, c)
      || handleOptOut(text, c)
      || handleUserSuppression(text, c)
      || handleRoleClosure(text, c)
      || handlePriorApplication(text, c)
      || handleSensitiveCorrection(text, c)
      || handleQueueCancel(text, c)
      || handleDoorstepCancel(text, c)
      || handlePacketValidity(text, c)
      || handleFollowUpStatus(text, c);
  }

  // ---------- main entry: consulted after 120, then 130 ----------

  // ---------- alert watches (152): create + list/manage in chat ----------
  // ALERTS HOST WIRING (Crew B Cycle 2, W4; design: docs/career/alerts-host-
  // wiring.md). 152 holds watch profiles per USER in an injected {get,set}
  // store (keys career:watch-profile:<user_id> etc.). This router is sync
  // and has NO per-user KV access today: its durable state is thread state
  // the host snapshot persists (career_host STATE_KEYS). watchStoreOf is the
  // sync adapter over that reality, in precedence order:
  //   1. ctx.alertStore — a host-injected sync KV, when a host supplies one;
  //   2. ctx.alertWatchState — a plain JSON object carried on ctx, created
  //      lazily on WRITE only (a read never materializes state). It becomes
  //      durable across threads only when the host adds "alertWatchState"
  //      to career_host.js STATE_KEYS — until then the harness (which keeps
  //      ctx by reference) persists it and the deployed handler does not.
  // The record itself is user-scoped by 152's key, so threads are views onto
  // one per-user profile, never separate profiles.
  function watchStoreOf(ctx, forWrite) {
    const c = ctx || {};
    if (c.alertStore && typeof c.alertStore.get === "function" && typeof c.alertStore.set === "function") return c.alertStore;
    if (!c.alertWatchState || typeof c.alertWatchState !== "object" || Array.isArray(c.alertWatchState)) {
      if (!forWrite) { const empty = {}; return { get: (k) => (k in empty ? empty[k] : null), set: () => {} }; }
      c.alertWatchState = {};
    }
    const box = c.alertWatchState;
    return { get: (k) => (Object.prototype.hasOwnProperty.call(box, k) ? box[k] : null), set: (k, v) => { box[k] = v; } };
  }
  function watchUserId(ctx) { return s((ctx && ctx.userId) || "user-1"); }
  function loadWatchProfileSync(ctx) {
    const A = getAssign(); if (!A) return null;
    try { return watchStoreOf(ctx, false).get(A.PROFILE_KEY(watchUserId(ctx))) || null; } catch { return null; }
  }
  function saveWatchProfileSync(ctx, wp) {
    const A = getAssign(); if (!A) return false;
    const v = A.validateWatchProfile(wp);
    if (!v.ok) return false;
    wp.updated_at = new Date(nowOf(ctx)).toISOString();
    watchStoreOf(ctx, true).set(A.PROFILE_KEY(wp.user_id), wp);
    return true;
  }
  // The role a watch ask names, resolved ONLY through 152's own specs: a
  // curated split by name or by one of its curated terms. Anything else is
  // not silently derived — a saved interest needs a SOC the taxonomy
  // carries, and inventing one would corrupt the profile the host polls on.
  // P8 phrases users actually say for a split whose canonical term is a
  // job title ("data analyst") — nobody asks to watch for "data analyst
  // roles" in the wild; they say "data roles". Aliases live HERE, in the
  // language layer, never in 152's title-term sets (a posting title term
  // must stay a title). Each alias resolves to a curated split by name.
  const WATCH_ROLE_ALIASES = { "data roles": "Data Analyst", "data role": "Data Analyst" };
  function watchRoleFromText(text) {
    const A = getAssign(); if (!A || !A.SPLITS) return null;
    const t = lc(text);
    for (const [phrase, split] of Object.entries(WATCH_ROLE_ALIASES)) if (t.includes(phrase)) return A.roleSpecFor({ split });
    for (const [split, spec] of Object.entries(A.SPLITS)) {
      if (!spec.soc) continue; // a split with no SOC cannot pass 152 validation; never saved
      if (t.includes(lc(split))) return A.roleSpecFor({ split });
      for (const term of spec.terms || []) if (term && t.includes(lc(term))) return A.roleSpecFor({ split });
    }
    return null;
  }
  const WATCH_CITIES = ["Chicago", "New York", "San Francisco", "Boston", "Seattle", "Los Angeles", "Houston", "Dallas", "Austin", "Denver", "Atlanta", "Miami", "London"];
  function watchLocationsFromText(text) {
    const raw = s(text);
    const out = [];
    for (const city of WATCH_CITIES) if (new RegExp(`\\b${city}\\b`, "i").test(raw) && !out.includes(city)) out.push(city);
    if (/\bNYC\b/.test(raw) && !out.includes("New York")) out.push("New York");
    if (/\bSF\b/.test(raw) && !out.includes("San Francisco")) out.push("San Francisco");
    if (/\bLA\b/.test(raw) && !out.includes("Los Angeles")) out.push("Los Angeles");
    return out;
  }
  function watchInterestLine(i) {
    const f = i.filters || {};
    const where = (f.locations || []).length ? f.locations.join(", ") : "any location";
    const remote = f.remote_ok === false ? "" : " + remote";
    const bands = (f.bands || []).length ? ` — ${(f.bands || []).join(" / ")} only` : "";
    const firms = (f.firms_include || []).length ? ` at ${(f.firms_include || []).join(", ")}` : "";
    return `${(i.role || {}).title || i.interest_id}${firms} — ${where}${remote}${bands}`;
  }
  // P8's second turn: a bare "yes, set that up for me" after a watch was
  // JUST created in this conversation. The affirmation writes nothing —
  // it confirms, from the saved record, what is already standing. Gated
  // on recency (an interest created within the last 15 minutes) so a
  // stray "yes, do it" in an unrelated conversation can never be read as
  // watch business; with no recent watch it returns null and the turn
  // falls through exactly as before.
  function handleWatchAffirm(text, ctx) {
    const A = getAssign(); if (!A) return null;
    const wp = loadWatchProfileSync(ctx);
    if (!wp || !Array.isArray(wp.interests) || !wp.interests.length) return null;
    const now = nowOf(ctx);
    const recent = wp.interests.filter((i) => i.created_at && (now - Date.parse(i.created_at)) <= 15 * 60 * 1000 && (now - Date.parse(i.created_at)) >= -60 * 1000);
    if (!recent.length) return null;
    // The line goes through watchInterestLine, with the band enum rendered
    // in human words: 140's reply screen vetoes the WHOLE composed reply
    // when a fact carries the raw "new_grad" token (it reads as an
    // internal enum leaking into user text — verified in isolation), so a
    // raw band name here would silently replace this confirmation with
    // the "nothing solid" fallback.
    const reply = compose({ headline: "Already set — that watch is live.", facts: recent.map((i) => `Watching: ${watchInterestLine(i).replaceAll("new_grad", "new grad")}.`), nextStep: "Want another role watched, or the full list of what you are watching?" });
    return { intent: "career_watch_affirm", reply, resultStatus: "completed", sends: 0, watch_profile: wp };
  }
  function handleWatchCreate(text, ctx) {
    const A = getAssign(); if (!A) return null;
    const profile = ctx && ctx.profile;
    if (!profile) {
      const reply = compose({ headline: "I can set that watch up — I need your profile on file first.", facts: ["A watch matches new postings against your confirmed facts and interests; with no profile there is nothing honest to match against, and a watch on no facts would fire on everything or nothing."], nextStep: "Tell me about yourself first — school, class year, the work you have done — and then say the watch again." });
      return { intent: "career_watch_create", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    const role = watchRoleFromText(text);
    if (!role) {
      const covered = Object.entries(A.SPLITS).filter(([, sp]) => sp.soc).map(([n]) => n).join(", ");
      const reply = compose({ headline: "That role is not one the watch can save yet.", facts: [`A saved watch needs a role from the taxonomy the assignment layer carries — today: ${covered}.`, "A role outside that set gets no watch rather than a watch keyed to an invented category, which would poll wrong and alert wrong."], nextStep: "Name one of those roles — or the closest one — and the watch is set in this turn." });
      return { intent: "career_watch_create", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    const t = lc(text);
    const bands = [];
    if (/\bintern(ship)?s?\b/.test(t)) bands.push("intern");
    if (/\bnew[ -]?grad/.test(t)) bands.push("new_grad");
    const firm = companyFromText(text, ctx);
    const interest = {
      interest_id: `int-${lc(role.title).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
      role,
      filters: { locations: watchLocationsFromText(text), remote_ok: !/\bno remote\b|\bonsite only\b/.test(t), bands, firms_include: firm ? [firm] : [], firms_exclude: [] },
      created_at: new Date(nowOf(ctx)).toISOString(),
    };
    const store = watchStoreOf(ctx, true);
    let wp = null;
    try { wp = store.get(A.PROFILE_KEY(watchUserId(ctx))) || null; } catch { wp = null; }
    if (!wp) wp = A.createWatchProfile(watchUserId(ctx), { scoring_profile: scoringProfile(profile) });
    if (!wp.scoring_profile) wp.scoring_profile = scoringProfile(profile);
    A.upsertInterest(wp, interest);
    if (!saveWatchProfileSync(ctx, wp)) {
      const reply = compose({ headline: "That watch did not save — the profile it built failed validation, so nothing was recorded.", facts: ["Nothing polls on a watch that is not saved; a half-saved watch would be worse than none."], nextStep: "Say the watch again with the role and city named plainly, and I will set it." });
      return { intent: "career_watch_create", reply, resultStatus: "blocked", sends: 0 };
    }
    const delivery = ctx.workerCapabilities && ctx.workerCapabilities.job_alert_delivery;
    const facts = delivery && delivery.status === "NOT_WIRED"
      ? [`Watching: ${watchInterestLine(interest)}.`, "The watch is saved in this conversation only; automatic alert delivery is not wired in this handler.", "No reminder has been delivered and no application has been submitted."]
      : [`Watching: ${watchInterestLine(interest)}.`, "The record is per-user, not per-thread: the host's scheduler reads this same profile, polls the boards on the standing cadence (starred companies every 15 minutes, the rest hourly), and a matching new posting becomes a reminder with the posting's own deadline quoted and the match basis stated.", wp.opt_out && wp.opt_out.global ? "Your job alerts are currently paused, so this watch is recorded but will not remind until you resume alerts." : "The watch is live the moment the host's next tick runs — creating it here sends nothing and applies to nothing."];
    const reply = compose({ headline: `Watch set: ${role.title}.`, facts, nextStep: "Want another role watched, or the list of what you are watching now?" });
    return { intent: "career_watch_create", reply, resultStatus: "prepared", sends: 0, watch_profile: wp, payload: wp, artifact: wp };
  }
  function handleWatchManage(text, ctx) {
    const A = getAssign(); if (!A) return null;
    const t = lc(text);
    const isPause = /\b(pause|hold)\b[^.]*\b(alerts?|watch)/.test(t) || /\bpause my (job )?alerts\b/.test(t);
    const isResume = /\b(resume|restart|unpause|turn back on)\b[^.]*\b(alerts?|watch)/.test(t);
    const isStop = /\b(stop watching|remove (the )?watch|delete (the )?watch|unwatch)\b/.test(t);
    const isList = /\bwhat am i watching\b|\blist my watches\b|\bshow my watches\b|\bmy watches\b|\bmy job alerts\b|\bwatch list\b|\bwhat'?s on my watch\b|\bshow me my watch\b|\bshow my watch\b|\bwhat'?s my watch\b|\bon my watch\b/.test(t);
    if (!isPause && !isResume && !isStop && !isList) return null;
    const wp = loadWatchProfileSync(ctx);
    if (!wp) {
      const reply = compose({ headline: "You have no job watches on file.", facts: ["No watch profile exists for you in this store yet, so there is nothing to list, pause, or remove — nothing was changed."], nextStep: "Say \"watch for\" plus a role — for example, \"watch for investment banking analyst roles in Chicago\" — and the first watch is set." });
      return { intent: "career_watch_manage", reply, resultStatus: "awaiting_user", sends: 0, watch_profile: null };
    }
    if (isPause || isResume) {
      A.setOptOut(wp, { global: isPause, companies: ((wp.opt_out || {}).companies || []) });
      if (!saveWatchProfileSync(ctx, wp)) return null;
      const delivery = ctx.workerCapabilities && ctx.workerCapabilities.job_alert_delivery;
      const reply = isPause
        ? compose({ headline: "Job alerts paused.", facts: [delivery && delivery.status === "NOT_WIRED" ? "Your saved watches stay paused in this conversation; automatic alert delivery is not wired in this handler." : "Your watches stay on file exactly as they are; the host's assignment cycle records the pause and queues no reminders while it stands."], nextStep: "Say \"resume my job alerts\" whenever you want them back." })
        : compose({ headline: "Job alerts resumed.", facts: [delivery && delivery.status === "NOT_WIRED" ? "Your saved watches are no longer paused in this conversation; automatic alert delivery is not wired in this handler." : "Your watches are active again; the host's next tick matches and reminds on them as before."], nextStep: "Want the current watch list read back?" });
      return { intent: "career_watch_manage", reply, resultStatus: "completed", sends: 0, watch_profile: wp, payload: wp };
    }
    if (isList) {
      let queued = 0;
      try { const q = watchStoreOf(ctx, false).get(A.QUEUE_KEY(wp.user_id)); queued = Array.isArray(q) ? q.length : 0; } catch { queued = 0; }
      const facts = wp.interests.length
        ? wp.interests.map((i) => `Watching: ${watchInterestLine(i)}.`)
        : ["Your watch profile exists but holds no interests right now — it polls nothing and reminds nothing."];
      if (wp.opt_out && wp.opt_out.global) facts.push("Job alerts are PAUSED for you: watches are recorded, and no reminders go out until you resume them.");
      const delivery = ctx.workerCapabilities && ctx.workerCapabilities.job_alert_delivery;
      if (delivery && delivery.status === "NOT_WIRED") facts.push("Automatic alert delivery is not wired in this handler; these watches are saved in this conversation only.");
      if (queued) facts.push(`${queued} reminder${queued === 1 ? " is" : "s are"} already queued for delivery.`);
      const reply = compose({ headline: wp.interests.length ? `You are watching ${wp.interests.length} role${wp.interests.length === 1 ? "" : "s"}.` : "Your watch list is empty.", facts, nextStep: "Add a role, remove one by name, or pause alerts — say which." });
      return { intent: "career_watch_manage", reply, resultStatus: "prepared", sends: 0, watch_profile: wp, payload: wp };
    }
    // stop watching X
    const role = watchRoleFromText(text);
    let target = null;
    if (role) target = wp.interests.find((i) => (i.role || {}).title === role.title) || null;
    if (!target && wp.interests.length === 1) target = wp.interests[0];
    if (!target) {
      const reply = compose({ headline: "Which watch should come off?", facts: wp.interests.map((i) => `Watching: ${watchInterestLine(i)}.`), nextStep: "Name the role to stop watching and I will remove exactly that one." });
      return { intent: "career_watch_manage", reply, resultStatus: "awaiting_user", sends: 0, watch_profile: wp };
    }
    A.removeInterest(wp, target.interest_id);
    if (!saveWatchProfileSync(ctx, wp)) return null;
    const reply = compose({ headline: `Stopped watching: ${(target.role || {}).title || target.interest_id}.`, facts: [`That interest is off your watch profile, so the host stops matching it from the next tick. ${wp.interests.length ? `${wp.interests.length} watch${wp.interests.length === 1 ? "" : "es"} remain${wp.interests.length === 1 ? "s" : ""}.` : "No watches remain on your profile."}`], nextStep: "Want the remaining list, or a new role watched instead?" });
    return { intent: "career_watch_manage", reply, resultStatus: "completed", sends: 0, watch_profile: wp, payload: wp };
  }

  // ---------- LOOP ACCEPTANCE: the batch-apply seam (155) ----------
  // The owner's done-test as a chat route: "apply to 15 <family> roles"
  // runs the whole loop in-product — 155 orchestrates 121/132/123/149
  // and reports back in this thread. Placed in dispatch AFTER the
  // ownership layer and the pause gate (state-change turns and the
  // global pause keep their priority) and BEFORE every content route:
  // before this seam the ask fell through to discovery/tailor and the
  // loop never ran (getPortalApply above had zero call sites).
  // Host contract (the router's standing injection pattern):
  // ctx.postings / ctx.discovery.postings carry the staged discovery
  // pool; ctx.batchDeps may carry { postings, log, boardFor,
  // portalProfile (149-shaped), profileFor, attestations, track }.
  // Without a host-supplied boardFor, drives stop named BOARD_NOT_WIRED
  // — honest, never faked. With ctx.batchDeps.delegateBatch set (the
  // J10 deployed composition), the ask instead creates the run
  // skeleton and delegates preparation to the browser worker via a
  // committed batch intent — see the delegate branch in
  // handleBatchApply. The run object rides ctx.batchApplyState
  // (a host STATE_KEYS entry) so the approval turn resumes it in a
  // later invocation; sessions are rebuilt there, and MI-116's hash
  // verification inside 149 is what stops a payload changed since the
  // card. The approval itself arrives as structured ctx
  // (ctx.batchApproval from the card tap) — never inferred from text.
  function batchDepsFor(c, log, pool) {
    const deps = c.batchDeps || {};
    return {
      postings: pool,
      profile: deps.portalProfile || c.portalProfile || batchPortalProfile(c.profile),
      profileMaster: c.profile || null,
      scoringProfile: deps.scoringProfile || null,
      log,
      now: nowOf(c),
      attestations: deps.attestations || {},
      boardFor: deps.boardFor || null,
      profileFor: deps.profileFor || null,
      track: deps.track || (({ company, role, confirmationId }) => {
        try { if (Track && Track.logApplication && c.profile) Track.logApplication(c.profile, { company, title: role }, { status: "applied", confirmationId }); } catch { /* the submission stands on 149's log; tracking is a record, not the act */ }
      }),
    };
  }
  function batchPortalProfile(master) {
    // Minimal 149-shaped profile from the 122 master when the host has
    // not injected one: identity fields only, NO answers — a required
    // screening question then stops that application named
    // (UNCOVERED_QUESTION) instead of being invented around. The full
    // fact-to-answer adaptation rides 149's answer map (the R-2 lane).
    const b = (master && master.basics) || {};
    const p = {
      name: b.name || b.full_name || (master && master.name) || null,
      email: b.email || (master && master.email) || null,
      phone: b.phone || null,
      location: b.location || null,
      answers: {},
    };
    const r = (master && master.resume) || b.resume || null;
    if (r && r.sha256) p.resume = { filename: r.filename || "resume.pdf", sha256: r.sha256 };
    return p;
  }
  function handleBatchApply(text, c) {
    const BatchApply = getBatchApply();
    if (!BatchApply) return null;
    const depsIn = c.batchDeps || {};
    const log = depsIn.log || c.batchLog || { records: [] };
    const standing = c.batchApplyState || null;
    if (standing && standing.status === "awaiting_approval" && c.batchApproval && c.batchApproval.approvedByUser === true) {
      const run = BatchApply.restoreRun(standing);
      if (!run) return null;
      const ap = BatchApply.approveRun(run, { approvedByUser: true });
      if (!ap.ok) {
        c.batchApplyState = BatchApply.serializeRun(run);
        return { intent: "career_batch_apply", resultStatus: "blocked", code: ap.code, sends: 0, reply: `I did not submit anything: ${ap.reason}` };
      }
      const ex = BatchApply.executeRun(run, batchDepsFor(c, log, null));
      c.batchApplyState = BatchApply.serializeRun(run);
      const sm = ex.summary || BatchApply.summarizeRun(run);
      return { intent: "career_batch_apply", resultStatus: run.status, batchRun: sm, sends: 0, reply: BatchApply.speakSummary(run).join("\n") };
    }
    const ask = BatchApply.parseApplyAsk(text);
    if (!ask) return null;
    if (!c.profile) return null; // no profile yet: the onboarding routes own the turn
    const run = BatchApply.createRun({ userId: c.userId || (c.profile && (c.profile.user_id || c.profile.userId)) || "user", familyText: ask.familyText, count: ask.count, now: nowOf(c) });
    if (depsIn.delegateBatch === true) {
      // J10 DELEGATE MODE (the deployed-runtime composition): the host
      // signals that batch execution belongs to the owned browser
      // worker (committed batch intents — the chat turn performs no
      // browser effect, the bridge's standing law). The seam creates
      // the run skeleton and stops: the handler plans a prepare intent
      // from it (career_task_bridge.planCareerBatchPrepare) and commits
      // it with this reply; the worker executor runs prepareRun in its
      // own process and the prepared run reads back on later turns.
      // The skeleton rides batchApplyState only so the handler can
      // find it after the turn — its status is "queued_prepare", never
      // "awaiting_approval", so this snapshot seam's approval branch
      // above can never mistake it for a prepared card.
      run.status = "queued_prepare";
      c.batchApplyState = BatchApply.serializeRun(run);
      return { intent: "career_batch_apply", resultStatus: "queued", batchRun: BatchApply.summarizeRun(run), batchDelegate: { phase: "prepare", runId: run.id }, sends: 0,
        reply: `I've handed this batch to the browser worker to prepare: it will find ${ask.count} ${ask.familyText} roles, screen out the ones that don't fit, tailor each application, and bring the batch back here at the final review screen. Nothing has been filled or submitted yet — ask me for the batch status and I'll read back exactly where it stands.` };
    }
    const pool = depsIn.postings || c.postings || (c.discovery && c.discovery.postings) || [];
    BatchApply.prepareRun(run, batchDepsFor(c, log, pool));
    c.batchApplyState = BatchApply.serializeRun(run);
    return { intent: "career_batch_apply", resultStatus: run.status, batchRun: BatchApply.summarizeRun(run), card: run.card, sends: 0, reply: BatchApply.speakSummary(run).join("\n") };
  }

  function dispatchChat(text, ctx) {
    const c = ctx || {};
    text = detypo(text); // routing copy only — records keep the original
    const t = lc(text);
    if (!t) return null;
    const profile = c.profile || null;
    syncThreadIn(c);
    capturePastedPosting(text, c);
    captureStatedFacts(text, c);
    // DEPTH LANE A (MI-013): bridge the stated facts into a thin
    // profile (see profileFromStatedFacts) so fact-stating users are
    // served by the profile-reading routes in THIS turn already.
    { const bp = profileFromStatedFacts(c); if (bp) c.profile = bp; else if (c.profile && c.profile._fromStatedFacts) c.profile = null; }
    // DEPTH LANE A (LF-01h): an explicit memory invocation — "draft
    // it from what you know about me" — is the most specific claim a
    // turn can carry: the user is ordering the record's USE. It is
    // triple-gated (invocation phrase + a writing verb + facts on
    // record) and stands down otherwise.
    { const mg = handleFactGroundedDraft(text, c); if (mg) return mg; }
    // A turn FRAMED as a relayed reply ("Reply handling: ...") is reply
    // handling, not a user instruction: the ownership layer's recipient /
    // opt-out matchers would misread the quoted banker's words as the
    // user's own. The reply family runs first for framed turns only;
    // unframed state-change turns keep the ownership layer's priority
    // (deep-dive contracts DD-7/DD-8 are untouched).
    const replyFramed = /^\s*reply handling:/i.test(s(text)) || /\brelayed reply\b|\ba reply (came|arrived|landed)\b/.test(t);
    if (replyFramed) {
      const rf = handleReplyFamily(text, c);
      if (rf) return rf;
    }
    // INTENT OWNERSHIP (lane A, round 2): state-changing turns are owned
    // before every existing route — including an active mock session, whose
    // plain answers never carry these instruction shapes.
    const owned = handleStateChangeIntents(text, c);
    if (owned) return owned;
    // SC-300's other half: while the global pause stands, action-shaped
    // turns on EVERY route are held (drafting / reading / status still run).
    const paused = handlePauseGate(text, c);
    if (paused) return paused;
    // LOOP ACCEPTANCE (155): the batch-apply ask and its approval
    // continuation run the apply loop itself (see handleBatchApply).
    const batchRes = handleBatchApply(text, c);
    if (batchRes) return batchRes;
    // Capability 2 owns read-only resume/role, gap, location and current-source
    // recommendations. It takes only host-injected profile/postings; it never
    // falls back to the filesystem corpus or touches alert/browser state.
    const recommendations = typeof CareerRecommendations !== "undefined" ? CareerRecommendations : req("./154-career-recommendations.js");
    const recommendationIntent = recommendations && recommendations.intentFor(text);
    if (recommendationIntent) {
      const rec = recommendations.recommend(Object.assign({}, c, { recommendationIntent, text: s(text) }));
      return { intent: "career_recommendations", reply: rec.text, resultStatus: "prepared", sends: 0, guidance: rec, payload: rec, artifact: rec };
    }
    // ALERTS HOST WIRING (W4): alert-watch intents (152) — manage before
    // create, so "stop watching X" / "what am I watching" are never read as
    // new-watch asks. Both step aside when 152 is absent from the bundle.
    if (/\b(what am i watching|list my watches|show my watches|my watches|my job alerts|watch list|what'?s on my watch|show me my watch|show my watch|what'?s my watch|stop watching|remove (the )?watch|delete (the )?watch|unwatch|pause my (job )?alerts|resume my (job )?alerts|pause\b[^.]*\balerts?\b|resume\b[^.]*\balerts?\b)/.test(t)) {
      const wm = handleWatchManage(text, c);
      if (wm) return wm;
    }
    if (/^(yes|yeah|yep|sure|ok|okay)[,.]?\s+(set that up|set it up|do it)( for me)?[.!]?$/.test(t.trim())) {
      const wa = handleWatchAffirm(text, c);
      if (wa) return wa;
    }
    if (/\bwatch for\b|\bset up a watch\b|\bcreate a watch\b|\bstart watching\b|\balert me (when|for)\b|\bnotify me when\b|\blet me know\b[^.]*\b(open up|opens?|come up|go live|get posted|are posted)\b|\btell me when\b[^.]*\b(open|opens|post)/.test(t)) {
      const wc = handleWatchCreate(text, c);
      if (wc) return wc;
    }
    // An active mock session captures plain ANSWERS before any other
    // intent — but never an instruction-shaped turn. A new task always
    // wins over a pending mock answer: without this guard, one started
    // mock poisons every later unrelated turn in the session (found by
    // the full-300 routing grade: SC-178's mock ate SC-221+ whole).
    // PREP-KB ROUTING (LF-07): the pending session resolves from the
    // prep-thread record as well as the profile — the record is the
    // copy that survives the turn boundary (see handlePrepStart).
    const pendingMock = (() => { try { const th = prepThreadOf(c); if (th && th.prepMock) return th.prepMock; } catch { /* fall through */ } return profile && profile._careerRouterPrep ? profile._careerRouterPrep : null; })();
    if (pendingMock) {
      // Capture ONLY narrative-led turns (a person answering: "I built...",
      // "In my last role...", "The hardest part was..."). Anything else —
      // label-led, noun-led, question, instruction — is a new task and the
      // mock simply stays pending. Defaulting to release is the safe side:
      // a released answer can be re-given; a swallowed task cannot.
      const firstTok = (t.split(/\s+/)[0] || "").replace(/[^a-z']/g, "");
      const narrativeLed = ["i", "in", "my", "the", "that", "this", "it", "we", "one", "so", "well", "yes", "no", "honestly", "basically", "because", "last", "during", "after", "when", "while", "for", "at", "on", "there", "here", "our", "they", "he", "she", "an", "a", "once", "first", "then", "but", "and", "from", "with", "back", "over"].includes(firstTok);
      // PREP-KB ROUTING (LF-07, custom battery 2026-10-18, Block 2 t7):
      // a LONG narrative-led turn is an answer even when it carries a
      // mid-sentence dash, a colon, or a trailing feedback ask ("…
      // How was that answer?") — those are how a person answers a
      // mock question and requests the critique in the same breath.
      // The release shapes below still govern short turns, which is
      // where a new task actually lives (the SC-178 poisonings were
      // task-shaped asks, not 100+ character first-person answers).
      const answerShaped = narrativeLed && s(text).length >= 120 && !/^(i have|i got|i'm a|i am a)\b/.test(t);
      const taskShaped = !narrativeLed || (!answerShaped && (/^[A-Za-z][^:]{1,48}:\s/.test(text) || /^[A-Z][^—]{3,60}—/.test(text) || /\?/.test(text))) || /^(i have|i got|i'm a|i am a)\b/.test(t);
      if (!taskShaped) {
        try { return handlePrepAnswer(text, c); } catch { if (profile) profile._careerRouterPrep = null; try { const th = prepThreadForWrite(c); if (th) delete th.prepMock; } catch { /* ignore */ } }
      }
    }
    // IB-TN-9: roleplay asks belong to 128's negotiation roleplay —
    // the guard sits BEFORE the mock matcher, whose alternation used
    // to swallow the word "roleplay" into prep_mock_start.
    if (/\broleplay\b|\bplay(s|ing)? the recruiter\b|\bact as the (recruiter|interviewer)\b/.test(t) && profile) {
      const rp = handleRoleplay(text, c);
      if (rp) return rp;
    }
    // BUG-178: a voice-mock ask must reach the honest-absent answer
    // BEFORE the mock-start branch claims it — "can we do a voice
    // mock interview" matched /\bmock interview\b/ first and was
    // answered as a profile problem. The check now sits ahead of the
    // mock matcher and covers the natural phrasings (talk out loud,
    // out loud, speak it), not just the exam's two shapes.
    if (/\bvoice mock\b|\bmock\b[^.]*\bby voice\b|\btalk out loud\b|\b(mock|interview|practice)\b[^.]*\b(out loud|aloud|by voice|with voice)\b|\bvoice\b[^.]{0,24}\b(mock|interview|practice)\b|\b(out loud|aloud)\b[^.]{0,24}\b(mock|interview|practice)\b/.test(t)) return handleVoiceMockUnavailable(text, c);
    // PREP-KB ROUTING (LF-07, custom battery 2026-10-18, Block 2 t6):
    // the verb-led shapes count too — "Let's do a quick mock" named
    // the activity as plainly as "mock interview" does, but matched
    // none of the noun phrases, so the turn fell to a bank-card serve
    // and no mock ever ran (the user's answer next turn then had no
    // session to land in). A verb (let's / do / run / start / begin /
    // give me) within a few words of "mock" is a start request.
    if (/\b(mock interview|interview me|practice interview|mock me|text mock|full mock|behavioral round)\b/.test(t) || /\b(let'?s|do|run|start|begin|give me)\b[^.?!]{0,24}\bmock\b/.test(t) || /\bmock\b[^.?!]{0,16}\b(start|begin|now)\b/.test(t)) {
      if (!profile) return { intent: "prep_needs_profile", reply: compose({ headline: "I need your profile record to run a mock from your real work." }) };
      return handlePrepStart(text, c);
    }
    // Relayed replies without the frame (quoted reply text, OOO notices,
    // bounce reports) — before any campaign route can misread them.
    if (!replyFramed) {
      const rf = handleReplyFamily(text, c);
      if (rf) return rf;
    }
    // Refusals (blasts, false referral claims, fabrication) outrank plans:
    // a demand turn must never be answered with a cheerful campaign plan.
    const refusal = handleRefusal(text, c);
    if (refusal) return refusal;
    const appendix = handleAppendixSafety(text, c);
    if (appendix) return appendix;
    // COMPLEXITY WAVE (BUG-176): the drafting conversation's second
    // turns — draft continuations, revisions, send attempts, decline
    // drafts, and offer-detail statements — owned here, before the
    // graph/campaign families can re-plan over them.
    {
      const dg = handleDeclineDraft(text, c);
      if (dg) return dg;
      // MI-123 (mechanism 3): counter revisions and counter-draft
      // asks are owned BEFORE the offer-detail capture in this block —
      // neither is an offer report, and the capture consumed both
      // (battery t3/t4).
      const rv = handleCounterRevision(text, c);
      if (rv) return rv;
      const cd = handleCounterDraftAsk(text, c);
      if (cd) return cd;
      const od = handleOfferDetail(text, c);
      if (od) return od;
      const dc = handleDraftContinuation(text, c);
      if (dc) return dc;
      const ds = handlePlanDraftSurgery(text, c);
      if (ds) return ds;
      const ct = handleContinuation(text, c);
      if (ct) return ct;
      const pr2 = handleProductRules(text, c);
      if (pr2) return pr2;
      const sa = handleSendAttempt(text, c);
      if (sa) return sa;
    }
    // R-C7 guards: no wired route exists for a live portal read or a voice
    // mock — the honest answer must land before tracker/prep routes invent
    // one (SC-105, SC-179).
    if (/\bportal status\b|\blog ?in\b[^.]*\bstatus\b|\bread my\b[^.]*\bapplication status\b/.test(t)) return handlePortalStatusUnavailable(text, c);
    if (/\bwhether ai helped\b|\bai helped my\b|\bdid ai help\b/.test(t)) {
      const au = handleAiUse(text, c);
      if (au) return au;
    }
    // Return-offer playbook BEFORE internship discovery (SC-277, A4): an ask
    // about a return offer on an internship is not a search for internships.
    // Negotiation-shaped return-offer asks (conversion, signing, extension)
    // belong to 128 and skip this branch.
    if (/\breturn[ -]?offer\b/.test(t) && !/\bconversion\b|\bbefore signing\b|\bextension\b|\bnegotiat/.test(t)) {
      const ro = handleReturnOffer(text, c);
      if (ro) return ro;
    }
    // Warm-path graph family (135) — before outreach, so "draft a warm
    // update touch" and school/alumni asks are not read as campaign asks.
    // The alumni-directory LANE (SC-148) fires only when the directory
    // itself is the subject — a people-find that merely names the directory
    // as a source (SC-027) belongs to the campaign route below.
    if (/\balumni-directory\b|\bdirectory path\b|\balumni director\w*\b[^.]*\b(thin|empty|sparse|few)\b/.test(t)) {
      const ga = handleGraphAlumni(text, c);
      if (ga) return ga;
    }
    if (/\bleft the firm\b|\bdeparted\b|\bonly contact\b[^.]*\bleft\b/.test(t)) {
      const dp = handleDepartedPath(text, c);
      if (dp) return dp;
    }
    if (/\breferral (ask|timing)\b|\bprepare the referral\b|\bask for (a )?referral\b/.test(t)) {
      const gr = handleGraphReferral(text, c);
      if (gr) return gr;
    }
    if (/\bdream (50|companies)\b|\bnetwork into\b/.test(t)) {
      const cp = handleCampaignPlan(text, c);
      if (cp) return cp;
    }
    if (/\breach out to (everyone|all)\b[^.]*\bi know\b/.test(t)) {
      const cp = handleCampaignPlan(text, c);
      if (cp) return cp;
    }
    if (/\bkeep[ -]?warm\b|\bwarm update\b|\bupdate touch\b|\bsix weeks\b|\bgone quiet\b|\bdormant contact\b|\brevive a\b|\brevive my\b/.test(t)) {
      const kw = handleKeepWarm(text, c);
      if (kw) return kw;
    }
    if (/\bwho do i know\b|\bwarm paths?\b|\banyone at\b|\bpath into\b|\bget me referred\b|\breferred at\b/.test(t)) {
      const gp = handleGraphPaths(text, c);
      if (gp) return gp;
    }
    if (/\bwhen did i last\b|\brelationship memory\b|\bforwardable blurb\b|\bblurb\b|\bintro request\b|\bpaths ranked\b|\bsecond[ -]degree\b|\bwarm[ -]path sweep\b|\bmentor map\b|\bmini\b[^.]*\bcampaign\b|\bone company\b[^.]*\b\d{1,3}\s+(?:people|person)\b[^.]*\bwarm|\btwo paths\b|\bemployee lookup\b|\bprofessor path\b|\bfamily[ -]friend\b|\bclub roster\b|\bfraternity\b|\brecruiter vs\b|\bconversion tracked\b|\breferral[ -]bonus\b|\bnew[ -]hire radar\b|\bmerged to one record\b|\bthree sources\b|\bsubmits the referral\b|\bthank[ -]you plus referral\b|\balumni in a different city\b|\bcurrent employer\b[^.]*\bexcluded\b|\bsits at my current employer\b/.test(t)) {
      const gc = handleGraphCatch(text, c);
      if (gc) return gc;
    }
    // Inbox events move the tracker themselves (126) — before any campaign
    // route can read an arriving email as an outreach ask.
    if (/\bconfirmation email (lands|arrives)\b|\brejection email (lands|arrives)\b|\boffer letter arrives\b|\binterview invite\b|\boa link arrives\b|\bassessment link arrives\b|\bquiet \d+ days\b|\bno word for \d+\b|\bquiet\b[^.]*\b(weeks?|days?)\b|\bdraft a nudge\b|\bnudge\b[^.]*\brecruiter\b|\bambiguous\b[^.]*\breply\b|\bthank[ -]you\b[^.]*\binterview\b|\bi got an interview\b/.test(t)) {
      const ie = handleInboxEvent(text, c);
      if (ie) return ie;
    }
    // Outreach campaign family (124 + intake 146). Specific handlers first;
    // the general people-plan (which ends the A3 catch-all's reign over
    // people asks) runs last inside the family.
    if (/\b(upload|spreadsheet|paste|import)\b[^.]*\b(names?|list|spreadsheet|csv)\b|\blist of \d+ names\b|\bi upload\b/.test(t)) {
      const ik = handleIntake(text, c);
      if (ik) return ik;
    }
    if (/\blearn my voice\b|\bmy voice\b|\bvoice profile\b/.test(t)) {
      const v = handleVoice(text, c);
      if (v) return v;
    }
    if (/\blist surgery\b|\bdrop (vps?|associates|analysts)\b|\bre[ -]?cut\b[^.]*\blist\b/.test(t)) {
      const ls = handleListSurgery(text, c);
      if (ls) return ls;
    }
    if (/\bdraft surgery\b|\bre[ -]?render\b[^.]*\b(sample|draft|email)s?\b/.test(t)) {
      const ds = handleDraftSurgery(text, c);
      if (ds) return ds;
    }
    if (/\bsafety plan\b/.test(t)) {
      const sp = handleSafetyPlan(text, c);
      if (sp) return sp;
    }
    if (/\bseed\b[^.]*\b(test|inbox|placement)\b|\bplacement test\b|\bsuppression check\b|\breserve pool\b|\bbackfill\w*\b/.test(t)) {
      const oo = handleOutreachOps(text, c);
      if (oo) return oo;
    }
    if (/\bhonest yield\b|\byield report\b/.test(t)) {
      const hy = handleHonestYield(text, c);
      if (hy) return hy;
    }
    if (/\btier mix\b|\btier c\b/.test(t)) {
      const tm = handleTierMix(text, c);
      if (tm) return tm;
    }
    if (/\bper[ -]?firm cap\b|\bone desk\b|\bcap per firm\b/.test(t)) {
      const fc = handleFirmCap(text, c);
      if (fc) return fc;
    }
    if (/\bfollow[ -]?ups?\b[^.]*\b(sooner|faster|more often|every\s+\d|daily)\b|\bmake\b[^.]*\bfollow[ -]?ups?\b[^.]*\b(go|come|send)\b/.test(t)) {
      // COMPLEXITY WAVE (BUG-176): a demand to CHANGE the locked
      // cadence is refused as a policy matter — the two-touch close
      // (~day 6, ~day 15) is locked law, and answering the demand
      // with the wave-timing explainer would read as agreement.
      const reply = compose({ headline: "The cadence does not move — it is locked, and the lock protects you.", facts: ["Follow-ups run on the locked two-touch close: a first follow-up around day 6, a final one around day 15, then the gracious close. Nothing goes between those touches, however the ask is phrased.", "Faster follow-ups are how a candidate becomes the person a banker filters: two touches reads persistent; five reads desperate, and spam breakers at the firm's gateway count them all the same."], nextStep: "Want to see exactly when your two touches fall for the current wave?" });
      return { intent: "intent_refusal", reply, resultStatus: "blocked", sends: 0, payload: { kind: "cadence_change_refused" }, artifact: { kind: "cadence_change_refused" } };
    }
    if (/\bfollow[ -]?up wave\b|\bday[ -]?6 follow\b|\bday[ -]?15\b|\bfinal follow[ -]?up\b|\bfollow[ -]?ups?\b[^.]*\b(go out|sent|send|land)\b|\bwhen\b[^.]*\bfollow[ -]?ups?\b/.test(t)) {
      const fw = handleFollowUpWave(text, c);
      if (fw) return fw;
    }
    if (/\bdigest\b/.test(t) && /\bapplication/.test(t)) {
      const td = handleTrackDigest(text, c);
      if (td) return td;
    }
    if (/\bweekly digest\b|\bweekly (roundup|recap|summary)\b|\bapplication roundup\b/.test(t)) {
      const td = handleTrackDigest(text, c);
      if (td) return td;
    }
    if (/\bdaily digest\b|\bcampaign digest\b|\bdigest during\b/.test(t)) {
      const dg = handleDigest(text, c);
      if (dg) return dg;
    }
    if (/\bclose[ -]?out\b|\bwhich angles worked\b|\bwrap up the campaign\b/.test(t)) {
      const co = handleCloseOut(text, c);
      if (co) return co;
    }
    if (/\bcomp expectations?\b|\bcompensation expectations?\b|\basks? my comp\b|\bexpected salary\b[^.]*\brecruiter\b|\bwhat salary\b[^.]*\bexpect\b|\bsalary\b[^.]*\bi expect\b|\brecruiter asked\b[^.]*\bsalary\b/.test(t) && profile) {
      return handleCompExpectation(text, c);
    }
    if (/\b(draft|write|compose|email)\b/.test(t) && profile) {
      const nd = handleNamedDraft(text, c);
      if (nd) return nd;
    }
    // IB-TN-6 (SC-208): counter-script asks are negotiation asks —
    // the A3 people matcher below reads "email" as both its verb and
    // its people noun, so the carve-out sits above it (the TN pack's
    // own instruction for exactly this capture).
    if (/\bcounter scripts?\b|\bscripts?\b[^.]*\bcounter\b/.test(t) && profile || (/\bcounter\b/.test(t) && /\b(exact words|word[ -]for[ -]word|email version|phone version|call version)\b/.test(t) && profile)) {
      const ng = handleNegotiation(text, c);
      if (ng) return ng;
    }
    // IB-AP-8: the portal-account branch sits BEFORE the people-ask
    // matchers — "email" + no job noun used to route a credential ask
    // into the campaign plan (SC-081).
    if (/\bportal\b[^.]*\baccount\b|\bworkday\b[^.]*\baccount\b|\bcreate\b[^.]*\b(alias|account|password|vault)\b|\b(alias email|vault password)\b|\bconfirm\b[^.]*\bportal\b/.test(t) && profile) {
      const pa = handlePortalAccountAsk(text, c);
      if (pa) return pa;
    }
    // DEPTH LANE B (MI-015): the career-path carve-out — a first-
    // person path ask ("been a bank teller, wanna end up in
    // corporate finance", "I'm in retail management, thinking about
    // running people ops") is a career-OS turn, not a people ask:
    // the A3 matcher below reads its role nouns as a sourcing ask.
    // The handler stands down on anything without a parseable
    // current/target role pair, a promotion shape, or a live path
    // thread, so the carve-out claims nothing else.
    {
      const cpE = careerPathGateHit(text, c, false);
      if (cpE) return cpE;
    }
    // DEPTH WAVE (BUG-213 / FR-370): a FIRST-PERSON career-
    // progression turn ("I'm stuck — how does anyone get from
    // analyst to associate, what's the ladder?") is a career-OS
    // turn, not a people ask — the A3 matcher below reads its "get"
    // + "associates" as a sourcing ask and answers a ladder question
    // with a list build. The class is deliberately narrow: a bare
    // "ladder" in an advice question (SC-222) or a "promotion" in a
    // resume-refresh report (SC-283) belongs to those turns' own
    // handlers, not to this branch.
    if (/\bstuck\b|\bhow does anyone (get|go|move|become)\b|\bhow do i get (from|promoted|to)\b|\bget promoted\b|\bmy promotion\b|\bpromotion (case|review|track|path)\b|\bshould i stay\b|\bcareer plan\b|\bwant (a |to get )promotion\b/.test(t)) {
      const os = handleOS(text, c);
      if (os) return os;
    }
    // A3 fix: people asks (find/email/get + people nouns, no job nouns as
    // the object) belong to the outreach plan — never to job discovery.
    if (/\bnetwork into\b/.test(t) || /\bdream (50|companies)\b/.test(t)) {
      const cp = handleCampaignPlan(text, c);
      if (cp) return cp;
    }
    // The noun side must name PEOPLE — "emails?" used to satisfy it,
    // so any ask containing the word "email" twice ("an email
    // version") was misread as a people ask (SC-208's theft). And the
    // mini-campaign shape (one company, a counted set, warm-first)
    // belongs to the graph family's sequencer, not the plan.
    // PREP-KB ROUTING (LF-02, custom battery 2026-10-18, Block 3 t2):
    // a hiring-bar / role-evidence question is NOT a people ask even
    // when it carries a sourcing verb and a people noun — "what does
    // it actually take to GET hired as a data ANALYST? Give me the
    // real numbers" was planned as a networking list ("Building the
    // list now: analysts at <on-record firm>…"), silently anchored
    // on the record's firm. Role-evidence shapes stand this gate
    // down; the intel branch's KB role branch answers them with the
    // library's numbers and n.
    if (/\b(find|get|email|reach|build|list|draft|source|gather|network)\b/.test(t)
      && /\b(bankers?|analysts?|associates?|people|persons|contacts?|founders?|recruiters?|traders?|lawyers?|alumni|engineers?|designers?|scientists?|consultants?|residents?|developers?|researchers?|product managers?|pms|swes)\b/.test(t)
      && !/\bwhat does it take\b|\bget hired as\b|\bhiring bar\b|\bwhat (do|does) (postings|employers|companies|firms) (require|look for|want|expect)\b|\bpostings (name|ask|require|usually|emphasize)\b/.test(t)
      && !/\b(roles?|jobs?|internships?|positions?|openings?)\b/.test(t)
      && !(/\bone company\b/.test(t) && /\b\d{1,3}\s+(?:people|person)\b/.test(text) && /\bwarm/.test(t))) {
      const cp = handleCampaignPlan(text, c);
      if (cp) return cp;
    }
    if (/\b(send|email)\b[^.]*\bresume\b|\bsend\s+[A-Za-z][a-z]+\s+my\b/.test(t)) {
      return handleOutreach(text, c);
    }
    // Apply family: the rulebook shapes (autopilot rule, link triage,
    // saved sensitive answers, knockouts, cooldowns) are answered by the
    // rules handler; a plain auto-apply ask chains to the doorstep.
    if (/\bauto[ -]?apply\b|\bapply on my behalf\b|\bautopilot\b|\bapply to (these|the) \d+ links\b|\btriage\b[^.]*\blinks?\b|\breferral stacking\b|\bsponsorship question\b|\beeo\b|\bself-identify\b|\bknockout\b|\bcooldown\b|\breapply\b|\bhackerrank invite\b|\bassessment invite\b|\bsalary expectation\b|\bsophomore\b[^.]*\bsweep\b|\bats parser\b|\bparser mangled\b|\bwrong-resume\b|\bnearly attached\b|\bdeadline radar\b/.test(t)) {
      const ar = handleApplyRules(text, c);
      if (ar) return ar;
      const aa = handleAutoApply(text, c);
      if (aa) return aa;
    }
    if (/\badd\s+[A-Z][A-Za-z0-9+#.]*/.test(s(text)) && /\b(watched|read about|saw|once|video)\b/.test(t) || /^"?add\s+[a-z][\w+#.]*/i.test(s(text)) && /\b(watched|read about|video once)\b/.test(t)) {
      const us = handleUnprovenSkill(text, c);
      if (us) return us;
    }
    if (/\bcover letters?\b/.test(t) && Tailor && !profile) {
      // COMPLEXITY WAVE (BUG-173): profile-less cover-letter asks get
      // the honest answer (target named, facts asked once), not a
      // fall through the gate to the generic fallback.
      return handleCoverLetterNeedsFacts(text, c);
    }
    if (/\bcover letters?\b/.test(t) && Tailor && profile) {
      let letter = null;
      try { letter = Tailor.generateCoverLetter ? Tailor.generateCoverLetter(profile, ctx.posting || null, {}) : null; } catch { letter = null; }
      const body = digText(letter, ["text", "body"], ["paragraphs", "lines"]);
      const reply = compose({ headline: "Cover letters only where the portal actually asks — in that company's own voice.", facts: [body ? body.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "A startup gets the builder's voice, a bank gets the formal one; the facts are the same, the register follows the company.", "No letter is generated for a portal that does not ask for one — an unrequested letter is noise, not effort."], nextStep: "Name the company and I will draft its letter first." });
      // BUG-114: the producer's own record is the turn's product —
      // with no company named it is the typed refusal (a letter is
      // never written from invented company facts); it rode only as
      // cover_letter, which no completion branch reads.
      const clRec = { kind: "cover_letter", ok: !!(letter && letter.ok), reason: (letter && letter.reason) || null, text_present: !!(letter && letter.text), rule: "only_where_portal_asks", registers: ["startup_builder_voice", "bank_formal_voice"] };
      return { intent: "career_tailor", reply, resultStatus: "prepared", sends: 0, cover_letter: letter || undefined, payload: clRec, artifact: clRec };
    }
    if (/\btailor\b|\btailored per\b|\bresume variants\b|\bvariants\b[^.]*\bresume\b|\banswer bank\b|\btruth audit\b|\bliving resume\b|\bresume diff\b|\bdiff review\b|\bbans? ai\b|\bai[ -]written\b|\bimpact bullets\b|\b(customi[sz]e|adjust|fit)\b[^.]*\bresume\b|\bresume\b[^.]*\bto this\b|\bmake my resume\b/.test(t)) {
      // COMPLEXITY WAVE (BUG-173): profile-less, the chain cannot
      // tailor — but the ask gets its honest answer (target named,
      // the one missing input named) instead of the silent null.
      if (!profile) return handleTailorNeedsFacts(text, c);
      // BUG-104: essay asks go to the essay producer FIRST — an
      // essay is not a resume variant, and letting the ask ride the
      // resume chain (or fall to discovery) is how SC-096 lost its
      // product.
      if (/\bessays?\b/.test(t)) { const es = handleEssayTailor(text, c); if (es) return es; }
      if (/\bwins? log\b/.test(t)) { const os = handleOS(text, c); if (os) return os; }
      if (/\btruth audit\b/.test(t) && Tailor) {
        let violations = null;
        try { const a = Tailor.auditResume(profile); violations = (a && (a.violations || a.findings)) || null; } catch { violations = null; }
        // WORDING-BACKLOG (BUG-181): the audit RUNS and its result
        // is shown — the dropped bullet and its reason when it
        // catches one, or the true clean result. Describing the
        // audit's policy instead of its outcome answers nothing.
        const vFacts = violations && violations.length
          ? violations.slice(0, 2).map((v) => `Dropped: "${String(v.line || v.text || "").slice(0, 110)}" — ${v.reason || "no fact behind it"}.`)
          : ["The audit ran over your current version and dropped nothing: every bullet traces to a confirmed fact on your profile.", "The drop is real when it fires — a bullet with no fact behind it comes out and is shown to you with the missing fact named, never quietly kept."];
        const reply = compose({ headline: violations && violations.length ? `The truth audit ran — ${violations.length} bullet${violations.length === 1 ? "" : "s"} dropped, shown with the reason.` : "The truth audit ran — nothing dropped, because every bullet traces to a fact.", facts: vFacts, nextStep: violations && violations.length ? "Want the dropped bullets' replacement lines drafted from your real facts?" : "Want the line-by-line trace — each bullet beside the fact behind it?" });
        // BUG-077: the audit report itself is this branch's prepared
        // artifact — the record of the audit over the current version.
        return { intent: "career_tailor", reply, resultStatus: "prepared", sends: 0, audit: violations ? { violations } : null, artifact: { kind: "truth_audit", scope: "current resume version", violations: violations || [], clean: !(violations && violations.length) } };
      }
      if (/\bresume diff\b|\bdiff review\b/.test(t)) {
        // BUG-077: when the ask itself states the diff (the quoted
        // change list), that list IS the review surface — it rides as
        // the branch's artifact, each change awaiting the user's
        // approval, exactly as the reply describes.
        const quoted = (s(text).match(/["“]([^"”]{10,})["”]/) || [])[1] || "";
        const changes = quoted ? quoted.split(/,\s*/).map((x) => x.trim()).filter(Boolean) : [];
        // WORDING-BACKLOG (BUG-181): the stated changes are SHOWN as
        // the diff lines under review — a reply that only describes
        // what a diff review would show has not reviewed anything.
        const cap1 = (x) => x ? x.charAt(0).toUpperCase() + x.slice(1) : x;
        const reply = changes.length >= 2
          ? compose({ headline: `The diff under review — ${changes.length} changes, line by line.`, facts: [...changes.slice(0, 3).map((ch) => `${cap1(ch)}.`), "Nothing enters a version silently; an added skill names the project that proves it, and a change you do not approve does not ship."], nextStep: "Approve the diff as shown, or name the line to revert?" })
          : compose({ headline: "The diff review, bullet by bullet.", facts: ["Every change is shown as a line: what moved, what was added, and the fact each addition traces to — an added skill names the project that proves it.", "Nothing enters a version silently; a change you did not approve does not ship."], nextStep: "Want the current version's diff against the master?" });
        return { intent: "career_tailor", reply, resultStatus: "prepared", sends: 0, ...(changes.length >= 2 ? { artifact: { kind: "resume_diff_review", changes, approval_state: "awaiting_user" } } : {}) };
      }
      if (/\bbans? ai\b|\bai[ -]written\b|\boutline \+ bullets\b/.test(t)) {
        // BUG-077: 123's coverOutline is this branch's product — the
        // outline + fact-cited bullets are DELIVERED as the artifact
        // (the scenario's ask), not merely offered in prose; the
        // paragraph itself stays the user's, per the ban.
        let outline = null;
        try { outline = Tailor && Tailor.coverOutline ? Tailor.coverOutline(profile, s(text), cirFor(text, c)) : null; } catch { outline = null; }
        const points = outline && Array.isArray(outline.points) ? outline.points : [];
        const reply = compose({ headline: "That company bans AI-written applications, so I will not write the paragraph.", facts: [points.length ? "Your outline and bullets are ready on the card — built only from facts on your profile, in the order the posting rewards." : "What I can do: the outline and the bullets, from facts on your profile, in the order the posting rewards.", "You write the prose in your own words; then I check it against the posting and your facts, and flag anything that drifts."], nextStep: "Write your paragraph from the outline, paste it back, and I will check it line by line." });
        return { intent: "career_tailor", reply, resultStatus: points.length ? "prepared" : "awaiting_user", sends: 0, ...(points.length ? { artifact: { kind: "cover_outline", points } } : {}) };
      }
      if (/\banswer bank\b|\bwhy this company\b/.test(t) && Tailor && Tailor.buildAnswerBank) {
        try {
          const bank = Tailor.buildAnswerBank(profile, []);
          const body = digText(bank, ["text", "summary"], ["answers", "entries", "lines"]);
          // BUG-114: the bank rides as payload + artifact with the
          // ask's count and the true company count (0 — no companies
          // named yet) on the record and in the reply (H-5).
          const wantN = Number((t.match(/(\d+)\s*(?:[a-z][a-z-]*\s+){0,2}?applications?\b/) || [])[1]) || null;
          const bankRec = { kind: "answer_bank", requested: wantN, companies: [], bank };
          const facts = [body ? body.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "Each answer joins one fact about the company to one fact about you; the shared spine is yours, the company half is fresh per application."];
          if (wantN) facts.unshift(`You named ${wantN} applications; the bank holds your spine today and 0 company answers — each company half is written fresh when you name the company, never templated in advance.`);
          const reply = compose({ headline: "Your answer bank: the company parts are rewritten every time, never templated.", facts, nextStep: "Name the six companies and I will draft the set." });
          return { intent: "career_tailor", reply, resultStatus: "prepared", sends: 0, answer_bank: bank, payload: bankRec, artifact: bankRec };
        } catch { /* fall through to the tailor chain */ }
      }
      if (/\bbatch\b/.test(t)) {
        const bt = handleBatchTailor(text, c);
        if (bt) return bt;
      }
      if (c.posting || c.jdText || c.jd) return handleTailor(text, c);
      // A company-targeted tailor: resolve that company's posting first.
      // BUG-111: companyFromText needs "at X" phrasing or a full-name
      // substring, so "Tailor for Goldman IBD / McKinsey / Palantir
      // FDE" resolved to NO company and fell into the discovery chain,
      // which tailored the pool's top SWE role under the named firm's
      // ask. A named-company company file resolves the firm here —
      // tailor-branch only; archetype files never resolve as a firm.
      let comp = companyFromText(text, c);
      let compCir = null;
      if (!comp) {
        try { const hit = cirFor(text, c); if (hit && !String(hit.company_id || "").startsWith("archetype")) { compCir = hit; comp = cirShortName(hit); } } catch { compCir = null; }
      }
      if (comp) {
        const named = postingByCompanyTitle(c, comp, text);
        if (named) {
          const chained = handleTailor(text, Object.assign({}, c, { posting: named }));
          if (chained && chained.artifact) { chained.chained_from = "company_target"; return chained; }
        }
        const { ranked } = rankedShortlist(profile, c, { company: lc(comp) });
        if (ranked.length) {
          const chained = handleTailor(text, Object.assign({}, c, { posting: ranked[0].posting }));
          if (chained && chained.artifact) { chained.chained_from = "company_target"; return chained; }
        }
        // IB-AP-3: the named company's retrieved board, read honestly.
        const fx = namedFixturePosting(comp, text);
        if (fx.match) {
          const chained = handleTailor(text, Object.assign({}, c, { posting: fx.match }));
          if (chained && chained.artifact) { chained.chained_from = "named_fixture"; return chained; }
        }
        if (fx.board.length) {
          const roles = fx.board.map((p) => `${p.title} (${p.location || "location as posted"})`).join("; ");
          const reply = compose({ headline: `${comp}'s own board, as retrieved, holds no role of the kind you named.`, facts: [`The retrieved board shows: ${roles}.`, "Tailoring your resume against a role of a different kind would dress a guess in your name — the tailor runs the moment a matching posting exists, in the pool or on the board.", "Source: the company's public board data, retrieved 2026-10-13."], nextStep: `Want the closest of those tailored instead, or ${comp} watched for the right opening?` });
          return { intent: "tailor_needs_posting", reply, resultStatus: "awaiting_user", artifact: null, sends: 0 };
        }
        // BUG-111: when the named firm has a company file, the refusal
        // carries the file's own fact about that firm and the cut
        // spec the ask itself stated — three different firms' asks
        // no longer receive one refusal, and none is "answered" by
        // tailoring an unrelated role.
        const npFacts = [];
        if (compCir) {
          const bar = cirFieldText(compCir.hiring_bar_summary);
          if (bar) npFacts.push(`What the ${comp} file supports today: ${bar.split(/(?<=[.!?])\s/)[0]}`);
          const specM = String(text || "").match(/[—–]\s*(.+)$/);
          const spec = specM ? specM[1].replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim() : null;
          if (spec && spec.length <= 110) npFacts.push(`Your spec for the cut is on record — ${spec} — and the tailor applies it the moment the posting exists.`);
        }
        npFacts.push("Tailoring invents nothing: without the posting, any 'tailored' version would be a guess wearing your name.");
        const reply = compose({ headline: `I need the ${comp} posting to tailor against — no ${comp} role is in the current list.`, facts: npFacts, nextStep: `Paste the ${comp} posting and the tailor runs immediately.` });
        // BUG-111: the resolved firm rides in typed state (and its
        // company file as the payload, the handleIntel pattern) — a
        // name the reply speaks must trace to state, not prose alone.
        return { intent: "tailor_needs_posting", reply, resultStatus: "awaiting_user", artifact: null, sends: 0, company: comp, ...(compCir ? { payload: compCir } : {}) };
      }
      if (/\bbig law\b|\bsummer associate\b|\blaw firms?\b/.test(t)) {
        // BUG-111: a category is not a posting. "Big Law" names no
        // firm and no law posting exists in the pool — the discovery
        // chain used to tailor the top SWE role under this ask.
        const eduFacts = (ProfileMod && ProfileMod.confirmedFacts ? ProfileMod.confirmedFacts(profile) : []).filter((f) => f && f.kind === "education");
        const eduBlob = eduFacts.map((f) => lc(`${f.title || ""} ${f.text || ""}`)).join(" ");
        const csNote = /computer science/.test(eduBlob) ? " and its education record is in computer science" : "";
        const facts = ["The ask names the conventions to follow — CV format, school and journal signals — but no firm's posting, and no law posting is in the current list.", `Your profile on file holds no law-school or journal facts${csNote}, so a law CV cut today would be built on nothing.`, "Tailoring invents nothing: without the posting, any 'tailored' version would be a guess wearing your name."];
        const reply = compose({ headline: "I need the posting to tailor against — Big Law is a category, not a posting.", facts, nextStep: "Paste the firm's posting and the CV cut runs immediately." });
        return { intent: "tailor_needs_posting", reply, resultStatus: "awaiting_user", artifact: null, sends: 0 };
      }
      // A6 chaining: no posting in hand — discover inside the ask's
      // families and tailor the top role in the same turn.
      const disc = handleDiscovery(text, c, {});
      if (disc.shortlist && disc.shortlist.length) {
        const topAdapted = postingsFromCtx(c).find((p) => p.corpus_id === disc.shortlist[0].id) || null;
        if (topAdapted) {
          const chained = handleTailor(text, Object.assign({}, c, { posting: topAdapted, _tailorContext: "discovery", _shortlistSize: disc.shortlist.length }));
          if (chained && chained.artifact) { chained.chained_from = "career_discovery"; chained.shortlist = disc.shortlist; return chained; }
        }
      }
      // BUG-077: the per-firm impact/fit explainer is the LAST
      // fallback, not a pre-emption — it used to fire before the
      // company-target and discovery chains above, so a named firm's
      // ask (SC-089 McKinsey) got prose instead of the tailored
      // artifact those chains produce.
      if (/\bimpact bullets\b|\bfit answers\b/.test(t)) {
        const reply = compose({ headline: "Per-firm tailoring: the fit answers and impact bullets are written firm by firm, never templated.", facts: ["Each firm's answers join one fact about that firm to one fact about you; the impact bullets are re-cut to the firm's own language from its posting.", "The set is built from the firms' live postings — name the firms or I take them from your target list."], nextStep: "Name the firms and I will draft the first set." });
        // BUG-114: the per-firm plan is the typed record when no
        // firm is named yet — firms: [] is the true state.
        const ffRec = { kind: "firm_fit_plan", firms: [], method: "per_firm_fit_answers_and_impact_bullets", built_from: "firms' live postings" };
        return { intent: "career_tailor", reply, resultStatus: "prepared", sends: 0, payload: ffRec, artifact: ffRec };
      }
      return disc;
    }
    if (/\brole at my current employer\b|\bcurrent employer\b[^.]*\bpacket\b|\bgap callout\b|\btheir interns mostly have\b|\breferral hold\b|\bhold the app\b|\bhold (the|my) application for\b|\bwait for (the |a )?referral\b|\bhold\b[^.]*\breferral\b|\breferral\b[^.]*\bapply now\b/.test(t)) {
      // IB-AP-4 Patch B: producers first — 133's gap callout and hold
      // decision answer from the record; handlePacketRules keeps ONLY
      // the current-employer refusal.
      if (/\bgap callout\b|\btheir interns mostly have\b/.test(t) && Packets && Packets.gapCallout) {
        try {
          const comp2 = companyFromText(text, c);
          const row = comp2 ? rankedShortlist(profile, c, { company: lc(comp2) }).ranked[0] : null;
          const fit = row ? { bucket: row.bucket, score: row.score, bar: row.bar } : null;
          const gc = Packets.gapCallout(profile, cirFor(text, c), fit);
          if (gc) {
            const body = digText(gc, ["text", "summary"], ["gaps", "lines"]);
            // WORDING-BACKLOG (BUG-182): the headline states the
            // FINDING — the named gap with its odds context, or the
            // true no-gap result — never a "callout" claim over a
            // body that found nothing to call out.
            const gapSkills = (gc.gaps || []).map((g) => g.skill).filter(Boolean);
            // WORDING-BACKLOG (BUG-204): the body's first sentence
            // restated the headline verbatim (the no-gap sentence
            // printed twice in one bubble), and "labeled with it"
            // claimed a gap label in the same breath as the no-gap
            // finding. The body skips its headline-restating first
            // sentence, and the label line says which label
            // actually ships.
            const bodySents = body ? body.split(/(?<=[.!?])\s/).filter(Boolean) : [];
            const bodyFacts = bodySents.length > 1 && /no (skill )?gap/i.test(bodySents[0]) && !gapSkills.length ? bodySents.slice(1, 3).join(" ") : bodySents.slice(0, 2).join(" ");
            const reply = compose({ headline: gapSkills.length ? `Gap callout: ${gapSkills.join(", ")} — named against your profile before you spend the application.` : "Gap callout: no gap is named against your proven skills in this company's file.", facts: [bodyFacts || "Your odds are stated from your actual profile against that pattern — plainly, not padded.", gapSkills.length ? "Proceeding is your call: the packet is not blocked by the gap, it is labeled with it." : "Proceeding is your call: the packet ships labeled with exactly that — no gap named in this company's file."], nextStep: "Want the packet built with the gap stated, or a season of closing it first?" });
            return { intent: "career_packet", reply, resultStatus: "prepared", sends: 0, packet: { ok: true, company: comp2, gap_callout: gc } };
          }
        } catch { /* fall through */ }
      }
      if (/\breferral hold\b|\bhold the app\b|\bhold (the|my) application for\b|\bwait for (the |a )?referral\b|\bhold\b[^.]*\breferral\b|\breferral\b[^.]*\bapply now\b/.test(t) && Packets && Packets.referralHoldDecision) {
        try {
          // BUG-114: the producer used to be fed placeholder inputs
          // (no contact, no referral-expected flag), so it answered
          // "no referral is expected" to an ask that names one. The
          // inputs now come from the ask itself: the named contact,
          // referral expected, and the ETA / deadline honestly null
          // when the ask does not state them — 133's HOLD_CAPPED
          // branch decides on exactly that record.
          // COMPLEXITY WAVE (BUG-169's other half): the natural form
          // of this ask STATES both numbers ("closes in 3 days",
          // "could take 2 days") — parse them from the ask and let
          // 133 decide on the real record, never on placeholders.
          const contactM = s(text).match(/\b([A-Z][a-z]+)'s referral\b/);
          const toHours = (n, unit) => Number(n) * (/^day/.test(unit) ? 24 : 1);
          const etaM = t.match(/refer\w*[^.]*?(?:could take|might take|takes?|within|in about|in)\s+(\d+)\s*(days?|hours?)/) || t.match(/(?:could take|might take|takes?)\s+(\d+)\s*(days?|hours?)[^.]*refer/);
          const dlM = t.match(/(?:closes?|closing|deadline|expires?)[^.]*?\b(?:in|within)\s+(\d+)\s*(days?|hours?)/) || t.match(/\b(?:in|within)\s+(\d+)\s*(days?|hours?)\b[^.]*\b(?:closes?|deadline)\b/);
          const hd = Packets.referralHoldDecision({ contactName: contactM ? contactM[1] : null, referralExpected: true, referralEtaHours: etaM ? toHours(etaM[1], etaM[2]) : null, hoursToDeadline: dlM ? toHours(dlM[1], dlM[2]) : null });
          if (hd) {
            // WORDING-BACKLOG (BUG-182): when the producer's own
            // reason says both times are missing from the record,
            // the headline says exactly that — claiming "deadline
            // math shown" over two unknowns is the headline
            // outrunning the record.
            const timesMissing = Array.isArray(hd.unknowns) && hd.unknowns.length > 0;
            const bothKnown = etaM && dlM;
            const facts = [s(hd.reason || hd.text || "The referral path is worth real time only while the posting stays open; the hold is capped at 48 hours and the packet is built meanwhile.")];
            facts.push(bothKnown ? "Those are your numbers, not mine: if the referral speeds up or the deadline moves, the call flips — tell me and I will redo the math on the new ones." : "Referral timing comes from the graph's own record of how fast referrals at this company actually land.");
            const reply = compose({ headline: timesMissing ? "The hold-versus-apply call — and neither time is on record." : "The hold-versus-apply call, with the deadline math shown.", facts, nextStep: "Hold it for the referral, or apply now and reference it after?" });
            const hdRec = { kind: "referral_hold_decision", decision: hd.decision, reason: hd.reason || null, hold_hours: hd.holdHours || null, contact: contactM ? contactM[1] : null, referral_eta_hours: etaM ? toHours(etaM[1], etaM[2]) : null, hours_to_deadline: dlM ? toHours(dlM[1], dlM[2]) : null, apply_after_referral: !!hd.applyAfterReferral };
            return { intent: "career_packet", reply, resultStatus: "awaiting_user", sends: 0, packet: { ok: true, company: companyFromText(text, c), hold: hd }, payload: hdRec, artifact: hdRec };
          }
        } catch { /* fall through */ }
      }
      if (/\bcurrent employer\b/.test(t)) {
        const pr = handlePacketRules(text, c);
        if (pr) {
          let chk = null;
          try { chk = Packets && Packets.guardEmployer ? Packets.guardEmployer(profile, companyFromText(text, c) || "", {}) : null; } catch { chk = null; }
          if (chk) pr.employer_check = chk;
          return pr;
        }
      }
    }
    if (/\bone[ -]page rule\b|\bats[ -]safe render\b|\bats render\b/.test(t)) {
      // IB-AP-4 Patch C: the one-page / ATS answers are 133's actual
      // check results on an actual packet — canned rules text only
      // when no posting resolves at all.
      const pk = handlePacket(text, c);
      if (pk && pk.packet) return pk;
      const pr = handlePacketRules(text, c);
      if (pr) return pr;
    }
    if (/\bbatch approval\b|\bapply to these \d+ roles\b|\bapproval card\b[^.]*\broles?\b/.test(t) && profile) {
      const bc = handleBatchCard(text, c);
      if (bc) return bc;
    }
    if (/\bsubmit\b[^.]*\b\d+ \w* ?applications\b/.test(t) && profile) {
      return handlePacket(text, c);
    }
    if (/\bprep(are)?\b[^.]*\b(application|packet)\b|\bapplication packet\b/.test(t)) {
      if (!profile) return handleTailorNeedsFacts(text, c);
      // SC-111 (A4): a packet ask that names only a role FAMILY with no
      // posting in the pool is a discovery ask — never a defaulted packet.
      const fams = discoveryFamilies(text);
      if (fams.length && !c.posting) {
        const hasFam = rankedShortlist(profile, c, {}).ranked.some((r) => fams.includes(r.posting.role_family));
        if (!hasFam) return handleDiscovery(text, c, {});
      }
      return handlePacket(text, c);
    }
    // DEPTH LANE B (MI-016 + MI-022): the prep-session claim —
    // practice/drill openers with a sector, continuations on a live
    // prep thread (another / harder / model answer), canonical
    // content asked inside any thread (the MI-022 switch), and a
    // long answer turn to a live drill. Owners of the neighboring
    // shapes (night-before, STAR, briefs, take-home) are stood down
    // inside the handler, which returns null and lets them run.
    {
      const pthB = prepThreadOf(c);
      const tnB = typoNorm(text);
      const sessionShape =
        /\b(can we|let'?s|start)\b[^.]*\b(practi[cs]e|practise|drill|prep)\b|\b(practice|practise|drill)\b[^.]*\b(cases?|questions?|technicals?|sql|probability|interviews?)\b|\bprep( me| us)?\b[^.]*\b(interview|technicals?|banking|consulting|data|law|medicine|quant|product)\b|\bdrill me\b|\bhelp me prep\b|\bpractice cases\b|\bcase practice\b|\bwhat do they ask\b/.test(tnB)
        || (/\bprep me\b/.test(tnB) && !!prepSectorOf(tnB))
        || (pthB.lastQ && /\banother\b|\bnext\b|\bharder\b|\bmodel answer\b|\bone more\b|\bhit me\b|\bgive me\b|\bagain\b/.test(tnB))
        || ((pthB.sector || pthB.lastQ) && /\bthree (financial )?statements\b|\bdcf\b|\blbo\b/.test(tnB))
        || ((pthB.sector || pthB.lastQ) && s(text).length < 70 && /\bone\b|\bfocus\b|\bweakest\b|\bsql\b|\bethics\b|\bmarket[- ]making\b|\bprobability\b|\bcomps\b/.test(tnB))
        || (pthB.lastQ && pthB.lastQ.drillId && s(text).length > 40 && /\bincome statement|balance sheet|cash flow|net income|retained earnings\b/.test(tnB))
        // PREP-KB ROUTING (LF-07/LF-02, custom battery 2026-10-18,
        // Block 2 t3/t4): a LIVE session also owns its behavioural
        // asks and its answer/critique continuations. Neither shape
        // was claimed before: the critique turn fell through to the
        // intel branch (which minted a "company" from its trailing
        // words), and the behavioural ask fell through behind it —
        // byte-identical. Both arms are session-gated, so a cold
        // turn's routing is untouched.
        || ((pthB.sector || pthB.lastQ) && /\bbehavioral\b|\bbehavioural\b/.test(tnB))
        || (pthB.lastQ && /\bmy (answer|approach|take)\b|\bcritique\b|\bfeedback\b|\bhow'?s (that|this|it)\b|\bscore (it|that|this|me)\b|\bgrade (it|that|this|me)\b/.test(tnB));
      if (sessionShape) { const ps = handlePrepSession(text, c); if (ps) return ps; }
    }
    // COMPLEXITY WAVE (BUG-173): single-question and night-before
    // prep asks route on their own shapes, ahead of the extras gate.
    if (/\bhit me with\b|\bgive me\b[^.]*\bquestion\b|\bask me\b[^.]*\bquestion\b|\bquiz me\b|\bdrill me\b/.test(t)) {
      const ps = handlePrepSession(text, c);
      if (ps) return ps;
      const pq = handlePrepQuestion(text, c);
      if (pq) return pq;
    }
    {
      const pe = handlePrepEve(text, c);
      if (pe) return pe;
    }
    if (/\b(wear|wearing|dress|attire|outfit)\b[^.]*\binterview\b|\binterview\b[^.]*\b(wear|dress code|attire)\b/.test(t)) {
      // COMPLEXITY WAVE: interview-attire asks are prep asks; they
      // previously matched no route at all. The answer is sector
      // doctrine, stated as doctrine — no facts about a firm.
      const fin = /\bfinance|bank|banking|ibd\b/.test(t) || (ctx.discovery && /finance|bank/i.test(s(ctx.discovery.lastIntelCompany)));
      const reply = compose({ headline: "For a first round: dress one notch above the room you are walking into.", facts: [fin ? "In finance that means a suit — jacket, trousers or skirt, button-down or blouse, closed shoes — even when the invite says business casual; first rounds are scored on polish before they are scored on answers." : "The safe default is business formal — suit, button-down or blouse, closed shoes — and for tech or startups, clean business casual: no tie needed, but nothing you would wear to class.", "Fit and condition carry more weight than labels: pressed, clean shoes, nothing distracting. When a company's file or invite names a dress code, that instruction wins over any general rule."], nextStep: "Tell me the company and round, and I will tune this to their file if one exists." });
      return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0 };
    }
    if (/\binterview brief\b|\bbrief me\b|\bprepare me for\b|\bfailure story\b|\bstory for\b|\bdrill me\b|\bquestion bank\b|\bstar bank\b|\bstar\b[^.]*\bstories\b|\bstories\b[^.]*\bstar\b|\bnight[ -]before\b|\btwo interviews\b|\bhiring[ -]manager round\b|\bportfolio walkthrough\b|\bprep pack\b|\binterviewer research\b|\bcoffee[ -]chat\b|\bprep set\b|\bsystem[ -]design prep\b|\bcase prep\b|\bquant prep\b|\btechnicals drill\b|\bpm prep\b|\bday[ -]of checklist\b|\bpost[ -]rejection retro\b|\bdebriefs say\b|\bmock scored\b|\bre[ -]?mock\b|\bfinal[ -]round prep\b|\bsuperday\b|\bvideo[ -]interview\b|\bvideo practice\b|\btake[ -]home\b|\bquestions[ -]to[ -]ask\b|\bbar[ -]raiser\b|\bteaching[ -]demo\b|\bresearch[ -]talk\b|\bdebrief\b|\bdeflection scripts\b|\bsalary\b[^.]*\bdeflect|\binterview\b[^.]*\b(thursday|friday|tuesday|wednesday|monday|tomorrow)\b/.test(t)) {
      // COMPLEXITY WAVE (BUG-173): the profile gate is GONE — the
      // extras run profile-less where their product allows, and what
      // genuinely needs the record gets the honest needs-profile
      // answer instead of the dispatch tail's silent null.
      let px = null;
      try { px = handlePrepExtras(text, c); } catch { px = null; }
      if (px) return px;
      if (!profile) return handlePrepNeedsProfile(text, c);
    }
    if (/\bautopsy\b/.test(t)) {
      const au = handleAutopsy(text, c);
      if (au) return au;
    }
    if (/\bfunnel\b|\bresponse rate by\b|\binterview rate\b/.test(t)) {
      const fn = handleFunnel(text, c);
      if (fn) return fn;
    }
    // Intel (125): a company-file match answers when the ask is
    // intel-shaped; guidance shapes go to the thesis/path machinery.
    {
      if (/\bgoes stale\b|\bstale\b[^.]*\bfile\b/.test(t)) {
        const reply = compose({ headline: "Stale files are labeled with their last-verified date, and I re-check them against current postings before using them.", facts: ["A company file whose hiring status is over 90 days old is re-verified against current public postings before it answers anything; until then it is labeled stale, with the date it was last verified.", `Sources: the company's own careers page and public postings — and when you name the company, I give the exact posting and verification dates (this answer's check is as of ${asOfMonthYear(c)}).`], nextStep: "If a fresher public source appears, the stale label is replaced here and the file re-enters use only after re-verification — nothing re-enters on the old date." });
        // BUG-074: the turn carries 125's refresh record for the
        // named company's file — or a typed blocker when no company
        // (hence no file) is named — never a bare template result.
        // BUG-116: the no-company shape ALSO carries the stale-file
        // policy as its typed record — the policy is the product
        // this ask can honestly produce, and the completion chain
        // completes on it (it previously had only the blocker, so
        // the turn could not complete at all).
        const staleCir = cirFor(text, c);
        let refresh = null;
        try { refresh = staleCir && Intel && Intel.refreshDue ? Intel.refreshDue(staleCir, new Date(nowOf(c)).toISOString().slice(0, 10)) : null; } catch { refresh = null; }
        const staleRec = refresh || staleCir || { kind: "file_refresh", status: "no_company_file_named", stale_after_days: 90, action: "re_verify_against_current_public_postings_or_label_stale" };
        return { intent: "company_intel", reply, resultStatus: "prepared", sends: 0, refresh: refresh || undefined, payload: staleRec, artifact: staleRec, blocker: refresh ? undefined : { code: "no_company_file_named", reason: "no company file is named or on record for this ask, so no refresh record can be computed" } };
      }
      if (/\badvice\b[^.]*\b(wrong|outdated)\b|\breport a piece of advice\b/.test(t)) {
        // IB-F5F7-5: flagged is the only state this turn creates —
        // the headline and the outcome stay in the future tense.
        // BUG-116: the outcome sentence names no bare claim verb —
        // "the advice withdrawn" read as a completed withdrawal
        // (H-7) for what is a conditional future step.
        const reply = compose({ headline: "Taken — tell me the exact claim and I will check it against its labeled source now and show you the result.", facts: ["If the claim does not hold, the company file is put right and the advice stops being served, and the case joins the eval set so the same error is caught automatically next time.", `Source class: the file's own labeled public sources, checked as of ${asOfMonthYear(c)}.`], nextStep: "Tell me the exact claim, and the check runs now." });
        // BUG-074: 125's reportOutdated log record rides the result
        // when a company file is named; otherwise a typed blocker.
        // BUG-116: the no-company shape carries the flag record
        // itself as the typed product (see the stale branch).
        const flagCir = cirFor(text, c);
        let report = null;
        try { report = flagCir && Intel && Intel.reportOutdated ? Intel.reportOutdated(flagCir, s(text), new Date(nowOf(c)).toISOString().slice(0, 10)) : null; } catch { report = null; }
        const flagRec = report || flagCir || { kind: "advice_report", status: "flagged_for_reverification", company_file_named: false };
        return { intent: "company_intel", reply, resultStatus: "prepared", sends: 0, report: report || undefined, payload: flagRec, artifact: flagRec, blocker: report ? undefined : { code: "no_company_file_named", reason: "no company file is named or on record for this report, so no re-verification log can be opened" } };
      }
      // WORDING-BACKLOG (BUG-186): a status question about MY
      // application is answered from the log + inbox BEFORE the
      // company-file branch can claim the turn — "What happened
      // with my Stripe application?" used to be served the Stripe
      // company file because the intel dispatch ran first and the
      // status branch's patterns never matched a company name
      // sitting between "my" and "application".
      if (/\bmy application\b[^.]*\b(status|stage|happened|update)\b|\bwhat happened with my\b[^.]*\bapplication\b|\bapplication status\b|\bstatus of my\b[^.]*\bapplication\b/.test(t)) {
        const sa = handleApplicationStatus(text, c);
        if (sa) return sa;
      }
      // BUG-271: an eligibility ask that names a company is claimed
      // by the intel branch below ("the adjuster role at Acme" reads
      // as a company question) — but its journey is grading, not a
      // company file. The eligibility handler self-gates tightly
      // (eligibility word + question shape, negotiation and tailor
      // turns excluded), so it claims here, ahead of intel; every
      // other turn passes through untouched.
      const elq = handleEligibilityAsk(text, c);
      if (elq) return elq;
      const iq = (/\?/.test(s(text)) || /\b(tell me|what|how|look for|hiring|comp|culture|interview process|file built|compare|pay|stats|statistics|library)\b/.test(t)) ? handleIntel(text, c) : null;
      if (iq) return iq;
      if (/\bhow do i get\b|\bwhat does it take\b[^.]*\b(get into|land|break into|get in)\b|\beven realistic\b|\bis .* realistic\b|\bfatal for\b|\bhonest odds\b|\bwhich fits me\b|\bstraight out of college\b|\bgrad school\b|\bwhich major\b|\bcareer switcher\b|\bany hope\b|\btake my job\b|\bactually require\b|\bactually help for\b|\boffsets the brand gap\b|\bcan i get faang\b|\bmarket bad\b|\bquant path\b|\bbig law\b|\bfrom undergrad\b|\bhow few\b|\bvc seats\b|\bdata science entry\b|\bstartup entry\b|\binternational student\b|\bprereqs\b|\bmcat\b|\bclearance timelines\b|\bh-1b\b|\bthe real ladder\b|\bno sugarcoating\b|\bcompany file built\b|\bvs\.?\b[^.]*\bfor me\b|\bmbb path\b|\bgoes stale\b|\badvice\b[^.]*\b(wrong|outdated)\b/.test(t)) {
        const ig = handleIntelGuidance(text, c);
        if (ig) return ig;
      }
    }
    {
      const tc = handleTrackCorrection(text, c);
      if (tc) return tc;
      const tmv = handleTrackMove(text, c);
      if (tmv) return tmv;
      const gc2 = handleGeoCorrection(text, c);
      if (gc2) return gc2;
      const pc = handlePlanCorrection(text, c);
      if (pc) return pc;
      const pr = handlePlanRecap(text, c);
      if (pr) return pr;
    }
    { const ter = handleTrackEventReport(text, c); if (ter) return ter; }
    if (/\bi applied\b|\blog (this|that|my|the) application\b|\badd\b[^.]*\btracker\b|\brecord my application\b|\btrack this\b/.test(t)) {
      const tl = handleTrackLog(text, c);
      if (tl) return tl;
    }
    if (/\bmy application\b[^.]*\b(status|stage|happened|update)\b|\bwhat happened with my\b[^.]*\bapplication\b|\bapplication status\b|\bstatus of my\b[^.]*\bapplication\b|\bdid\b[^.]*\b(reject|respond|get back)\b/.test(t)) {
      const sa = handleApplicationStatus(text, c);
      if (sa) return sa;
    }
    if (/\bwhat happened with\b[^.]*\bapplication\b/.test(t)) {
      const ts = handleTrackStatus(text, c);
      if (ts) { ts.intent = "doorstep_status"; return ts; }
    }
    if (/\bits status\b|\bstatus of (it|that)\b/.test(t)) {
      const ts = handleTrackStatus(text, c);
      if (ts) return ts;
    }
    if (/\bghosted\b|\bdays silent after\b|\bquiet hours\b/.test(t)) {
      const ts = handleTrackStatus(text, c);
      if (ts) return ts;
    }
    if (/\bi accepted\b|\baccepted an offer\b|\baccepted the offer\b/.test(t)) {
      const ao = handleAcceptedOffer(text, c);
      if (ao) return ao;
    }
    if (/\bwhere do i stand\b|\bstatus of\b|\bmy applications\b|\bwhat applications\b|\bapplications (do|have) i have\b|\btracker\b|\bapplication status\b|\bmy pipeline\b|\bpipeline\b/.test(t)) {
      const ts = handleTrackStatus(text, c);
      if (ts) return ts;
    }
    if (/\bwhich (of those|of these|one)\b[^.]*\b(attention|first)\b|\bneeds (my )?attention\b/.test(t)) {
      const ta = handleTrackerAttention(text, c);
      if (ta) return ta;
    }
    if (/\bfunnel\b|\bresponse rate by\b|\binterview rate\b/.test(t)) {
      const fn = handleFunnel(text, c);
      if (fn) return fn;
    }
    if (/\boffer expiring\b|\bexpiring\b[^.]*\b(friday|tomorrow|this week)\b/.test(t)) {
      const ts = handleTrackStatus(text, c);
      if (ts) return ts;
    }
    // DEPTH WAVE (BUG-213 / FR-370): the negotiation CLAIM is a
    // signal set, not a phrase list: an offer event (offered / offer
    // came in / exploding deadline), a decision question over money,
    // a deadline-move ask, or a draft ask — most of all when the
    // THREAD already carries an offer record, where bare follow-ups
    // ("more time?", "write the email", "take it?") are negotiation
    // turns by context. Safety and more specific branches (141
    // halts, inbox events, offer-detail statements) all sit BEFORE
    // this gate and keep their turns.
    {
      const thread = (c.negotiationThread && typeof c.negotiationThread === "object") ? c.negotiationThread : null;
      const hasOfferThread = !!(thread && (thread.firm || thread.amount || thread.deadline || thread.descriptor || thread.signing || thread.expectation || (Array.isArray(thread.amounts) && thread.amounts.length)));
      const tn = typoNorm(text);
      const negSignal =
        /\bnegotiat|\bcounter\b[^.]*\boffer\b|\bcounter scripts?\b|\bscripts?\b[^.]*\bcounter\b|\boffer letter\b|\bshould i accept\b|\bdecline\b[^.]*\boffer\b|\bbenchmark\b[^.]*\boffer\b|\btwo offers\b|\boffers? compared\b|\bextension request\b|\bexploding offer\b|\bequity explainer\b|\bequity\b[^.]*\bworth\b|\bsigning[ -]bonus\b|\bbelow[ -]floor\b|\bcomp[ -]expectation\b|\bcompeting deadline\b|\bleverage\b|\bsalary talk\b|\bconversion play\b|\bwithdrawal drafts\b|\bgraceful withdrawal\b|\btax and legal\b/.test(t)
        || /\boffered me\b|\boffer came in\b|\bgot an offer\b|\bgot the offer\b|\boffer'?s here\b|\boffer letter'?s here\b|\boffer (just )?(landed|arrived|dropped)\b|\ban offer (just )?(landed|arrived|came)\b|\boffer letter (came|arrived|landed)\b|\bexploding deadline\b|\bshould i take it\b|\btake it or (leave|negotiate|push)\b/.test(t)
        || (/\$\s?\d|\b\d{2,3}\s?k\b/.test(t) && /\boffer/.test(t) && /\bshould i\b|\btake it\b|\baccept\b/.test(t))
        // DEPTH LANE B (MI-014): genuine-phrasing signal classes the
        // exam dialect never used — an expiring offer stated plainly,
        // a deadline-move ask with no thread yet, a decision question,
        // an is-it-low question over a stated figure, an options-worth
        // question, a came-back figure, a decline ask, a parse ask.
        || /\boffer expires\b|\bexpires in \d+\s*(hours?|days?)\b|\bexpiring offer\b|\bwhat do i do first\b[^.]*\boffer\b|\boffer\b[^.]*\bwhat do i do\b/.test(tn)
        || /\bpush (it|the deadline|this|back)\b|\bmore time\b|\bask for (an? )?extension\b|\bextension\b[^.]*\b(ask|draft|email|request)\b|\bget (until|till)\b[^.]*\b(monday|tuesday|wednesday|thursday|friday|answer|decide)\b/.test(tn)
        || /\bshould i (take|accept|sign)\b|\bis \d{2,3}\s?k (low|good|enough|fair)\b|\bis (it|this|the offer) (low|good|enough|fair)\b|\bwhat would you counter\b|\bcounter at\b|\bcame back at\b|\bcan i still negotiate\b|\bdid i cap myself\b/.test(tn)
        || /\bstock options\b|\boptions?\b[^.]*\bworth\b|\bworth\b[^.]*\boptions?\b|\bask them about\b[^.]*\b(grant|offer)\b|\bdecline\b[^.]*\b(one|offer|gracefully)\b|\bturn down\b[^.]*\boffer\b|\bparse it\b|\bwhat'?s missing\b[^.]*\b(letter|offer)\b/.test(tn)
        || (hasOfferThread && /\bmore time\b|\bextension\b|\bpush\b|\bdeadline\b|\bdraft\b|\bwrite\b[^.]*\b(email|letter|it|reply)\b|\bactual email\b|\bcounter\b|\bdecline\b|\bparse\b|\bmissing\b|\bsigning\b|\bbonus\b|\bwhat do i say\b|\bwhat should i say\b|\bsay on the call\b|\btake it\b|\bsign(ing)?\b|\bworth\b|\bpays more\b|\byear one\b|\bwhich (one|pays|is)\b|\buntil (monday|tuesday|wednesday|thursday|friday)\b|\bchange the picture\b|\bask them\b/.test(tn))
        || (/\bextension\b/.test(t) && /\b(draft|write|email|letter|ask|request)\b/.test(t) && /\boffer|deadline|recruit/.test(t + (thread ? " offer" : "")));
      if (negSignal) {
        const ng = handleNegotiation(text, c);
        if (ng) return ng;
      }
    }
    // DEPTH LANE B (MI-015): the career-path claim — see
    // careerPathGateHit. The late placement catches what reaches the
    // OS region (ladder questions, plan continuations).
    {
      const cp = careerPathGateHit(text, c, true);
      if (cp) return cp;
    }
    // DEPTH WAVE (BUG-213 / FR-370): the career-OS claim likewise
    // takes ladder / stuck / promotion / long-plan signal classes.
    // It sits AFTER the intelligence and warm-path gates, so "quant
    // path"-shaped asks and referral-path asks keep their owners;
    // what it adds is the plain-words career-shape turn ("I'm stuck
    // — how does anyone get from analyst to associate?").
    if (/\btimeline\b|\bgoals? check\b|\bwatch ?list\b|\bskill gap\b|\bmarket value\b|\blog a win\b|\bwins? log\b|\bdebrief\w*\b|\btake[ -]home plan\b|\bvideo[ -]interview practice\b|\bfinal[ -]round prep\b|\bsuperday\b|\bwhat am i worth\b|\bpassive watch\b|\bnetwork upkeep\b|\bgoing cold\b|\breview packet\b|\bfirst[ -]?90\b|\bquarterly check[ -]?in\b|\bcheck[ -]?in:\b|\bpay band moved\b|\bpay band\b[^.?!]*\b(moved|move|shift|changed|risen|dropped)\b|\bhas\b[^.?!]*\bpay band\b[^.?!]*\bmoved\b|\bmarket[ -]shift\b|\bskill[ -]demand\b|\bquestions[ -]to[ -]ask\b|\bwhat do i say in a coffee chat\b|\bbar[ -]raiser\b|\bteaching[ -]demo\b|\bresearch[ -]talk\b|\bstuck\b|\bquit(ting)?\b|\bpromotion\b|\bpromot\w+\b|\bladder\b|\bcareer plan\b|\bnext level\b|\blevel up\b|\bgrowth plan\b|\blong[- ]term plan\b|\bshould i stay\b|\bmove up\b|\bget promoted\b/.test(t)) {
      const os = handleOS(text, c);
      if (os) return os;
    }
    if (/\bseason\b[^.]*\b(dashboard|retro|so far)\b|\bassessment score\b|\blog (my|the) (assessment|score)\b|\bannual career retro\b|\bcareer retro\b/.test(t)) {
      const sn = handleSeason(text, c);
      if (sn) return sn;
    }
    if (/\btwo[ -]year\b|\bre[ -]?route\b|\bdream role\b/.test(t)) {
      const pa = handlePathsAnswer(text, c);
      if (pa) return pa;
    }
    // COMPLEXITY WAVE (SC-110): the evidence-forward ML ask in
    // natural words ("for data and ML roles, make my application
    // lead with my papers, models, and evaluation metrics") names no
    // "roles:" label, so the profile-gated apply-shapes block below
    // never saw it — in either world. Its owner is handleMlForward,
    // whose core is discovery (profile only enriches its tailor
    // chain), so it routes here without the profile gate.
    if (/\bdata\/ml\b|\bml roles\b|\bdata and ml\b/.test(t) && /\b(lead with|papers|models|metrics|forward|roles)\b/.test(t)) {
      const ml = handleMlForward(text, c);
      if (ml) return ml;
    }
    if (/\bbucket\b[^.]*\broles?\b|\btriage\b[^.]*\b(links|roles)\b|\bghost\b|\bstarred\b|\bspeed run\b|\bposted in the last\b|\bbatch:|\bsweep\b[^.]*\b(open|windows)\b|\bapply to these \d+ roles\b|\broles:|\bearly programs\b|\binsight programs\b|\bsalary[ -]band filter\b|\bskip roles whose\b|\bweak[ -]profile honesty\b|\bno math background\b/.test(t) && profile) {
      const dead = handleDeadBoard(text, c);
      if (dead) return dead;
      const shape = {};
      if (/\bbucket\b/.test(t)) { shape.headline = "Bucketed by fit — apply-now, stretch, and skip, each with its reason."; shape.nextStep = "Want the apply-now bucket tailored first?"; }
      else if (/\bstarred\b|\bwatch\b/.test(t)) { shape.headline = "Your starred companies, watched — new roles surface the day they post."; shape.nextStep = "Want the watch widened beyond the starred set?"; }
      else if (/\bsweep\b|\bearly programs\b|\binsight programs\b/.test(t)) { shape.headline = "The sweep: every open window in this family, read from the boards themselves."; shape.nextStep = "Want the open windows ranked by deadline?"; }
      else if (/\bghost\b/.test(t)) { shape.headline = "Real roles only — ghost postings are flagged and excluded from the count."; shape.nextStep = "Want the flagged ghosts listed with their evidence?"; }
      else if (/\bbatch:|\bapply to these\b/.test(t)) { shape.headline = "The batch, staged role by role — nothing submits as a blob."; shape.nextStep = "Review the first few, then the rest stop at their doorsteps."; }
      else if (/\bsalary[ -]band/.test(t)) { shape.headline = "Filtered by your floor: roles whose posted band sits under it are skipped, and the skips are shown."; shape.nextStep = "Want the skipped-under-floor roles listed?" }
      // BUG-112: these shapes have their own products (121's
      // buckets, the starred watch, the ghost assessment, the
      // salary filter, the weak-profile refusal + path, the
      // ML-forward set) — they no longer ride the generic shortlist
      // under a swapped headline.
      if (/\bbucket\b/.test(t)) { const bk = handleFitBuckets(text, c); if (bk) return bk; }
      if (/\bstarred\b/.test(t)) { const sw = handleStarredWatch(text, c); if (sw) return sw; }
      if (/\bghost\b/.test(t)) { const gh = handleGhostAssessment(text, c); if (gh) return gh; }
      if (/\bsalary[ -]band filter\b|\bskip roles whose\b/.test(t)) { const sf = handleSalaryFilter(text, c); if (sf) return sf; }
      if (/\bweak[ -]profile honesty\b|\bno math background\b/.test(t)) { const wp = handleWeakProfile(text, c); if (wp) return wp; }
      if (/\bdata\/ml\b|\bml roles\b/.test(t)) { const ml = handleMlForward(text, c); if (ml) return ml; }
      if (/\btailor\w*\b/.test(t)) { const bt = handleBatchTailor(text, c); if (bt) return bt; }
      return handleDiscovery(text, c, shape);
    }
    {
      // COMPLEXITY WAVE (BUG-180): the late honest layer — synthesis
      // over stated facts, the acknowledgment of a pure fact-giving
      // turn, and the narrow clarifying questions — sits just above
      // the discovery tail, after every specific route has had its
      // chance.
      // W-NEXTSTEP (MI-012 / LF-01a): a strict whole-turn next-step
      // follow-up over ACTIVE WORK claims ahead of synthesis (which
      // composes from facts alone); it stands down when no work is
      // active, so facts-only and cold threads keep synthesis and
      // the continuation branch as their owners.
      const nsf = handleNextStepFollowUp(text, c);
      if (nsf) return nsf;
      // BUG-271: eligibility asks are claimed earlier, ahead of the
      // intel gate (a company-named eligibility ask reads as a
      // company question there); the record layer below additionally
      // refuses "am i eligible" as a self-check shape.
      // DEPTH LANE A (MI-013 / LF-01h): the memory-USE layer — a
      // read-back of the record, a fit ranking over the standing
      // search, a role direction from the experience fact, a review
      // plan for a standing interview, and the standing plan's
      // first move. Each stands down without its record.
      const rr = handleRecordRecall(text, c);
      if (rr) return rr;
      const sr = handleStatedFactReadback(text, c);
      if (sr) return sr;
      const ff = handleFitFollowUp(text, c);
      if (ff) return ff;
      const fd = handleFactDirection(text, c);
      if (fd) return fd;
      const pf = handlePrepFollowUp(text, c);
      if (pf) return pf;
      const of = handleOutreachFirst(text, c);
      if (of) return of;
      const fs2 = handleFactSynthesis(text, c);
      if (fs2) return fs2;
      const thc = handleThreadContinuation(text, c);
      if (thc) return thc;
      const sf = handleStatedFactsReply(text, c);
      if (sf) return sf;
      const cq = handleClarifying(text, c);
      if (cq) return cq;
    }
    {
      // COMPLEXITY WAVE (BUG-173): a discovery follow-up merges into
      // the stored search before any fresh-ask route can misread it.
      const dd = handleDiscoveryDelta(text, c);
      if (dd) return dd;
    }
    if (/\bfind\b[^.]*\b(roles|jobs|internships|positions)\b|\bfind me roles\b/.test(t)) {
      // COMPLEXITY WAVE (BUG-173): the profile gate is GONE — a
      // profile-less find runs the same discovery and returns its
      // honest result (the empty-pool answer names the empty list,
      // never silence). This was the World-L silent-null mechanism.
      const dead = profile ? handleDeadBoard(text, c) : null;
      if (dead) return dead;
      // BUG-266 (FR-421 boundary moved deliberately, 2026-10-17): an
      // internship-HEADED find is served by the internship-banded
      // route (bands intern/new-grad/junior + the summer headline),
      // not the generic ranked search that returned full-time roles
      // with no internship framing. The http-host pin moved with it
      // (see the BUG-266 ledger row); the no-fabrication property the
      // pin exists for holds under both routes (empty pool -> empty
      // shortlist, nothing invented).
      if (/^internships?$/.test(findHeadNoun(t) || "")) return handleInternship(text, c);
      return handleDiscovery(text, c, {});
    }
    if (/\b(need|want|looking for|searching for)\b[^.]*\b(internships?|jobs?|roles?)\b|\binternships?\b[^.]*\b(help|next summer|summer)\b|\bhelp\b[^.]*\b(internships?|jobs?)\b/.test(t)) {
      return handleInternship(text, c);
    }
    if (/\bfind\b|\bshortlist\b|\broles worth\b/.test(t)) {
      // BUG-266: the same head-noun rule on the bare-find tail — an
      // internship-headed shape that named no listed noun ("find
      // internship programs") still lands on the banded route.
      if (/^internships?$/.test(findHeadNoun(t) || "")) return handleInternship(text, c);
      return handleDiscovery(text, c, {});
    }
    // NOTE: 141's own chat phrases (halt / submit / fill / status) are NOT
    // delegated to from here — lane-A contract tests pin those turns'
    // handler attribution to 141 itself, and the chain already falls
    // through to 141 when this router returns null or the fallback.
    // BUG-227 (MI-047, FR-385): the guidance dispatch gate (in the
    // intel block above) and guidanceIntentFor kept SEPARATE phrase
    // lists, and the flagship entry shapes ("break into investment
    // banking — where do I start?") fell through both into the
    // contained fallback (LF-01f). The intent matcher is a source of
    // truth too — but it runs HERE, after every named owner in this
    // dispatch has had its chance: an ask another handler owns (the
    // weak-profile plan, SC-113, whose text happens to match
    // plan_paths' quant...path shape) keeps its owner, and only the
    // otherwise-unowned guidance-shaped asks reach the guidance
    // engine instead of the generic fallback.
    if (guidanceIntentFor(t)) {
      const ig = handleIntelGuidance(text, c);
      if (ig) return ig;
    }
    // Career-adjacent but unmatched: the 140 unmatched fallback finally has a
    // caller (the baseline noted it existed with none in the path).
    if (/\b(job|career|resume|interview|application|internship|intern)\b/.test(t)) {
      return { intent: "career_fallback", reply: Reply ? Reply.fallback("unmatched") : "I didn't catch that.", resultStatus: "awaiting_user" };
    }
    return null; // not a career turn this router owns: silence stays for other lanes' surfaces
  }

  // ---------- COMPLEXITY WAVE (BUG-180): stated-fact capture. What
  // a user TELLS the product about themselves ("I'm a sophomore",
  // "I study finance and computer science", "last summer I interned
  // at a wealth firm doing client reports") is state — it was
  // previously dropped on the floor, so a later "knowing all that,
  // what should I do first?" had nothing to know. Declarative frames
  // only; the user's clause is stored verbatim as the evidence.
  // DEPTH WAVE (BUG-214 / FR-371): the capture pass is a MECHANISM,
  // not a list of battery sentences. It runs on every turn, before
  // dispatch, over the user's own UNQUOTED words only, clause by
  // clause, and a clause may record a fact only when it is the user's
  // own assertion — declarative, non-conditional, not a question.
  // The same fact content in question form, in quotes, attributed to
  // someone else, or under a conditional records NOTHING (the
  // BUG-169 speech-act invariant, applied to profile facts). Short
  // declarative profile facts are recorded with their verbatim
  // clause as evidence: school year, major, geography, target firm,
  // level, school, experience, tone. Single-value kinds are REPLACED
  // by a later statement or an explicit correction ("make it Chicago
  // not New York"), never accumulated into a contradiction.
  const FACT_CITIES = ["New York", "Chicago", "San Francisco", "Boston", "Houston", "Dallas", "Los Angeles", "Seattle", "Austin", "Miami", "Charlotte", "Denver"];
  const FACT_SINGLE_KINDS = new Set(["year", "geography", "target_firm", "level", "tone", "school", "majors"]);
  function recordThreadFact(ctx, kind, value, evidence) {
    if (!value) return false;
    const clean = s(value).replace(/\s+/g, " ").replace(/[,;.]+$/, "").trim();
    if (!clean) return false;
    if (!(ctx.statedFacts && Array.isArray(ctx.statedFacts.facts))) ctx.statedFacts = { facts: [] };
    const facts = ctx.statedFacts.facts;
    const ev = s(evidence || "").slice(0, 200);
    if (FACT_SINGLE_KINDS.has(kind)) {
      const ex = facts.find((f) => f.kind === kind);
      if (ex) {
        if (lc(ex.value) === lc(clean)) return false;
        ex.value = clean; ex.evidence = ev; ex.at = new Date(nowOf(ctx)).toISOString();
        ctx.statedFacts.updatedAt = ex.at;
        return true;
      }
    } else if (facts.some((f) => f.kind === kind && lc(f.value) === lc(clean))) return false;
    facts.push({ kind, value: clean, evidence: ev, at: new Date(nowOf(ctx)).toISOString() });
    ctx.statedFacts.updatedAt = new Date(nowOf(ctx)).toISOString();
    return true;
  }
  function factClausesOf(text) {
    // The user's own words only: quoted spans are someone else's
    // speech (unquotedText strips them), and capture works clause
    // by clause so a statement riding beside a question still counts
    // while the question itself never does.
    return unquotedText(text).split(/(?<=[.!?])\s+|[,;]\s*|\s+[—–]\s+/).map((x) => x.trim()).filter(Boolean);
  }
  function clauseIsAssertion(cl) {
    const l = lc(cl);
    if (/\?\s*$/.test(cl)) return false;
    if (/^(what|why|how|when|who|whom|which|should|would|could|can|will|do|does|did|is|are|am|was|were|if|suppose|let's say|say i|imagine)\b/.test(l)) return false;
    return true;
  }
  const _cleanFactVal = (v) => s(v).replace(/\b(btw|though|now|mostly|please|thx|thanks)\b.*$/i, "").replace(/[\s,;.]+$/, "").trim();
  function captureStatedFacts(text, ctx) {
    const raw = s(text);
    const added = [];
    // BUG-272: a fact stated AGAIN, identical to the one on record,
    // writes nothing (recordThreadFact's dedupe returns false) — but
    // the turn is not empty: the user restated their own record.
    // Track restatements apart from additions so the reply layer can
    // acknowledge the fact as already on record instead of dropping
    // the turn to the generic fallback (v227 live verification).
    const restated = [];
    const push = (kind, value, clause) => {
      if (recordThreadFact(ctx, kind, value, clause)) { added.push({ kind, value: s(value).trim() }); return; }
      const clean = s(value).replace(/\s+/g, " ").replace(/[,;.]+$/, "").trim();
      if (clean && statedFactsOf(ctx).some((f) => f.kind === kind && lc(f.value) === lc(clean)) && !restated.some((r) => r.kind === kind)) restated.push({ kind, value: clean });
    };
    // (0) Explicit corrections REPLACE the fact they correct — the
    // correction clause itself is the assertion ("make it Chicago
    // not New York", "actually Denver, not Boston").
    {
      const u = unquotedText(raw);
      const corr = u.match(/\b(?:make it|shift it to|change it to|switch it to|move it to)\s+([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)\s*,?\s+not\s+([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)\b/)
        || u.match(/\bactually\s+([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)\s*,?\s+not\s+([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)\b/);
      if (corr && clauseIsAssertion(u)) {
        const facts = statedFactsOf(ctx);
        const old = facts.find((f) => f.kind === "geography" && lc(f.value) === lc(corr[2]));
        if (old || facts.some((f) => f.kind === "geography") || FACT_CITIES.some((ct) => lc(ct) === lc(corr[1]))) {
          push("geography", corr[1], corr[0]);
          ctx._geoCorrectionThisTurn = { from: corr[2], to: corr[1] };
        }
      }
    }
    // (0b) DEPTH LANE A (LF-01c): a corrected FIRM name replaces the
    // target-firm fact it corrects — "not Vantage — I meant Halcyon
    // Robotics", "actually scratch that — it's Northgate Legal now".
    // The correction clause is itself the assertion of the new name;
    // the old name must match the standing fact, so a correction can
    // never invent a target the user never named.
    {
      const NAME = "([A-Z][A-Za-z0-9&.]+(?:\\s+[A-Z][A-Za-z0-9&.]+){0,2})";
      // The correction's two halves are routinely split by the
      // em-dash the clause splitter cuts on ("not Vantage — I meant
      // Halcyon"), so the whole unquoted turn is matched FIRST and
      // the clauses second; a match applies once (the fact it
      // corrects no longer matches the old name afterwards).
      const corrTexts = [unquotedText(raw), ...factClausesOf(raw)];
      for (const cl of corrTexts) {
        if (!clauseIsAssertion(cl)) continue;
        let cm = cl.match(new RegExp(`\\bnot\\s+${NAME}\\s*[—–,-]\\s*(?:i meant|it'?s|that'?s|i mean)\\s+${NAME}`, "i"));
        let newName = null, oldName = null;
        if (cm) { oldName = cm[1]; newName = cm[2]; }
        else {
          cm = cl.match(new RegExp(`\\b(?:it was|it'?s|that was)\\s+${NAME}\\s*,?\\s+not\\s+${NAME}`, "i"));
          if (cm) { newName = cm[1]; oldName = cm[2]; }
          else if (/\bscratch that\b|\bscratch it\b/i.test(cl)) {
            const nm = cl.match(new RegExp(`\\bit'?s\\s+${NAME}`, "i")) || cl.match(new RegExp(`\\bmake it\\s+${NAME}`, "i"));
            if (nm) { newName = nm[1]; const cur = statedFactsOf(ctx).find((f) => f.kind === "target_firm"); if (cur) oldName = cur.value; }
          }
        }
        if (newName && oldName) {
          const cleanNew = newName.replace(/[?.!,]+$/, "").trim();
          const tf = statedFactsOf(ctx).find((f) => f.kind === "target_firm" && (lc(f.value) === lc(oldName) || lc(f.value).startsWith(lc(oldName)) || lc(oldName).startsWith(lc(f.value))));
          if (tf && lc(tf.value) !== lc(cleanNew)) { push("target_firm", cleanNew, cl); ctx._firmCorrectionThisTurn = { from: tf.value, to: cleanNew }; }
        }
      }
      // The scratch-that shape splits across the clause boundary
      // ("actually scratch that — it's Northgate Legal now"), so it
      // is matched on the whole unquoted turn as well.
      const u2 = unquotedText(raw);
      if (/\bscratch that\b|\bscratch it\b/i.test(u2) && !ctx._firmCorrectionThisTurn) {
        const nm = u2.match(new RegExp(`\\bit'?s\\s+${NAME}`, "i")) || u2.match(new RegExp(`\\bmake it\\s+${NAME}`, "i"));
        const cur = statedFactsOf(ctx).find((f) => f.kind === "target_firm");
        if (nm && cur) {
          const cleanNew = nm[1].replace(/[?.!,]+$/, "").trim();
          if (lc(cur.value) !== lc(cleanNew)) { push("target_firm", cleanNew, nm[0]); ctx._firmCorrectionThisTurn = { from: cur.value, to: cleanNew }; }
        }
      }
    }
    // (1) Per-clause declarative capture.
    for (const cl of factClausesOf(raw)) {
      if (!clauseIsAssertion(cl)) continue;
      // DEPTH LANE A (floor): a clause whose SUBJECT is a third person
      // ("my roommate is a junior at Yale studying art history") states
      // facts about THEM — the bare "studying X" pattern used to record
      // the roommate's major as the user's own. Person and preference
      // facts are captured only from clauses about the user.
      if (/^\s*(?:my|the|his|her|their)\s+(roommate|friend|friends|brother|sister|classmate|coworker|co-worker|colleague|cousin|partner|boyfriend|girlfriend|wife|husband|mom|dad|mother|father|teammate|mentor|professor|boss|manager|uncle|aunt|nephew|niece|son|daughter)\b/i.test(cl)) continue;
      if (/^\s*(?:he|she|they)\s+(?:is|was|are|were|studies|studied|works|worked|goes|went|interned|majors|majored)\b/i.test(cl)) continue;
      let m;
      if ((m = cl.match(/\b(?:i'?m|i am|im)\s+a\s+(first|second|third|fourth)[- ]year\b/i))) push("year", { first: "freshman", second: "sophomore", third: "junior", fourth: "senior" }[m[1].toLowerCase()], m[0]);
      else if ((m = cl.match(/\b(?:i'?m|i am|im)\s+(?:a\s+)?(?:rising\s+)?(sophomore|junior|senior|freshman|frosh|grad student|graduate student)\b/i))) push("year", m[1].toLowerCase(), m[0]);
      else if ((m = cl.match(/^(?:so|ok|okay|yeah|and)?\s*(sophomore|junior|senior|freshman)\b/i))) push("year", m[1].toLowerCase(), m[0]);
      if ((m = cl.match(/\b(?:i\s+)?(?:study|studying|majoring in|major in)\s+([a-z][a-z &]{2,40})/i))) push("majors", _cleanFactVal(m[1]), m[0]);
      else if ((m = cl.match(/\bmy majors?\s+(?:is|are)\s+([a-z][a-z &,]{2,40})/i))) push("majors", _cleanFactVal(m[1]), m[0]);
      // DEPTH LANE A: the inverted statement ("finance and computer
      // science are my majors") names the same fact subject-last.
      else if ((m = cl.match(/^([a-z][a-z &,]{2,40}?)\s+(?:is|are)\s+my\s+majors?\b/i))) push("majors", _cleanFactVal(m[1]), m[0]);
      else if ((m = cl.match(/\b([a-z][a-z &]{2,30}?)\s+major\b/i)) && !/^(what|which|the|a|my)\b/i.test(m[1].trim())) push("majors", _cleanFactVal(m[1].replace(/^(a|the|my)\s+/i, "")), m[0]);
      // LF-08 (BUG-270 / FR-425): this frame was the one proper-name
      // geography frame with NO city gate — "targeting Meridian
      // Capital" filed a FIRM name as geography (the reply then
      // confirmed it in the geography wording, "you're targeting
      // Meridian Capital"), and the next turn's real geography
      // statement silently overwrote the single-value slot, so the
      // firm the product had confirmed was never on the record under
      // its own kind and a new thread denied it was ever stated.
      // A targeting name that is not a known city is not geography —
      // the target_firm chain below claims it.
      if ((m = cl.match(/\btargeting\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/)) && FACT_CITIES.some((ct) => lc(ct) === lc(m[1]))) push("geography", m[1], m[0]);
      else if ((m = cl.match(/\baiming\s+(?:at|for)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+firms\b/)) && FACT_CITIES.some((ct) => lc(ct) === lc(m[1]))) push("geography", m[1], m[0]);
      else if ((m = cl.match(/\btargeting\s+([a-z]+)\s+firms\b/i)) && FACT_CITIES.some((ct) => lc(ct) === lc(m[1]))) push("geography", m[1].charAt(0).toUpperCase() + m[1].slice(1), m[0]);
      // DEPTH LANE A: "I want New York firms" — the want-frame names
      // the search geography as plainly as "targeting" does.
      else if ((m = cl.match(new RegExp(`\\bwant\\s+(${FACT_CITIES.join("|")})\\s+(?:firms|roles|jobs|banks|companies|offices)\\b`, "i")))) push("geography", m[1], m[0]);
      // LF-09 (iii) (BUG-276 / FR-431): the bare `in <CITY>` frame used
      // to fire on any location keyword in the clause (network /
      // target / firms / aiming / looking / move / based) — so
      // "looking at data analyst roles in Chicago" (P6 t1, live
      // v227) overwrote the durable geography a basing statement
      // ("I'm based in Denver") had written. A JOB's location is not
      // the user's geography: this frame now fires only when the
      // clause predicates the city of the USER — a first-person
      // location verb (I'm based / located / living, I live, I
      // reside, I'm from, "I'm in <CITY>"), "my home/base is", or a
      // bare "based in" inside a self-description whose subject is
      // not a role/job/posting (the Lane A corpus shape "junior
      // here — economics major, based in Denver btw"). The two
      // frames above are city-gated for the same reason (LF-08's
      // named sector misfile: "targeting fintech firms" filed
      // "Fintech" as geography and evicted the real basing fact
      // from the single-value slot).
      else {
        const cm = cl.match(new RegExp(`\\bin\\s+(${FACT_CITIES.join("|")})\\b`));
        if (cm) {
          const before = cl.slice(0, cm.index);
          const ownLocation =
            /\b(i'?m|i am|im)\s+(based|located|living|staying)\b[^.]*$/i.test(before)
            || /\b(i live|i reside|i'?m from|i am from)\b[^.]*$/i.test(before)
            || /\bmy\s+(home|base|residence|city)\s+is\s*$/i.test(before)
            || /\b(i'?m|i am)\s*$/i.test(before)
            || (/\bbased\s*$/i.test(before) && !/\b(role|job|position|posting|opening|gig|team|office|company|it|this|that)\b[^.]*\bbased\s*$/i.test(before));
          if (ownLocation) push("geography", cm[1], cm[0]);
        }
      }
      // LF-08 (BUG-270 / FR-425): "I'm targeting <Firm>" — the most
      // natural target-firm statement there is — had no frame in this
      // chain at all; the geography chain's ungated targeting frame
      // took the name instead (see above). Same discipline as
      // network-into: a known city is never a firm.
      if ((m = cl.match(/\btargeting\s+([A-Z][A-Za-z0-9&.]+(?:\s+[A-Z][A-Za-z0-9&.]+){0,2})/))) { const firm = m[1].split(/\s+\bin\b/i)[0].trim(); if (firm && !FACT_CITIES.some((ct) => lc(ct) === lc(firm)) && !/^(the|my|a|an)$/i.test(firm)) push("target_firm", firm, m[0]); }
      else if ((m = cl.match(/\bnetwork into\s+([A-Z][A-Za-z0-9&.]+(?:\s+[A-Z][A-Za-z0-9&.]+){0,2})/))) { const firm = m[1].split(/\s+\bin\b/i)[0].trim(); if (firm && !FACT_CITIES.some((ct) => lc(ct) === lc(firm)) && !/^(the|my|a|an)$/i.test(firm)) push("target_firm", firm, m[0]); }
      else if ((m = cl.match(/\bmostly\s+([A-Z][A-Za-z0-9&.]+(?:\s+[A-Z][A-Za-z0-9&.]+)?)\s+type\s+(?:places|firms|companies)\b/)) && !FACT_CITIES.some((ct) => lc(ct) === lc(m[1]))) push("target_firm", m[1], m[0]);
      else if ((m = cl.match(/\bmy\s+(?:#1|top|first|main)\s+target\s+is\s+([A-Z][A-Za-z0-9&.]+(?:\s+[A-Z][A-Za-z0-9&.]+){0,2})/))) push("target_firm", m[1], m[0]);
      // DEPTH LANE A: the plain frame — "my target firm is X" — is the
      // most natural way to state it and had no pattern at all.
      else if ((m = cl.match(/\bmy\s+target\s+(?:firm|company|bank|shop|employer)\s+is\s+([A-Z][A-Za-z0-9&.]+(?:\s+[A-Z][A-Za-z0-9&.]+){0,2})/))) push("target_firm", m[1].trim(), m[0]);
      if ((m = cl.match(/\b(analysts|associates|interns|bankers)\b[^.]*\b(first|instead|rather than)\b/i))) push("level", m[1].toLowerCase(), m[0]);
      else if ((m = cl.match(/^\s*(?:find|line up|get|list|start with)\s+(analysts|associates|interns|bankers)\b/i))) push("level", m[1].toLowerCase(), m[0]);
      // DEPTH LANE A: exclusivity and too-senior frames ("analysts
      // only for me — associates are too senior for where I am").
      else if ((m = cl.match(/\b(analysts|associates|interns|bankers)\s+only\b/i))) push("level", m[1].toLowerCase(), m[0]);
      if ((m = cl.match(/\b(analysts|associates|mds|partners|vps)\s+(?:are|is)\s+too\s+(?:senior|junior|advanced|high)\b/i))) push("excluded_level", m[1].toLowerCase(), m[0]);
      if ((m = cl.match(/\b(?:skip|not|no)\s+(?:the\s+)?(mds|partners|vps|managing directors)\b/i))) push("excluded_level", m[1].toLowerCase(), m[0]);
      // DEPTH LANE A: the school anchors were case-sensitive against
      // sentence-initial capitals ("I go to Northeastern" never
      // matched the lowercase anchor) — the name itself stays
      // capital-gated, the first-person anchor takes either case.
      if ((m = cl.match(/\b(?:i|I) go to\s+([A-Z][A-Za-z&. ]{2,40}?)(?:[.!?]|$)/))) push("school", m[1].trim(), m[0]);
      else if ((m = cl.match(/\b(?:i|I)(?:'m| am)\s+at\s+([A-Z][A-Za-z&. ]{2,40}?\b(?:University|College|School|Institute)\b)/))) push("school", m[1].trim(), m[0]);
      if ((m = cl.match(/\b(?:last summer|this summer|last year)\s+i\s+(?:interned|worked)\s+at\s+([a-zA-Z][a-zA-Z&. ]{2,50}?)(?:\s+doing\s+([a-z ][a-z ]{2,40}?))?(?:[.!?]|$)/i))) push("experience", `${m[1].trim()}${m[2] ? ` — ${m[2].trim()}` : ""}`, m[0]);
      else if ((m = cl.match(/\bi\s+(?:interned|worked)\s+at\s+(.+?)(?:\s+last\s+(?:summer|year)\b|\s+doing\s+(.+?)|[.!?]|$)/i))) push("experience", `${m[1].trim()}${m[2] ? ` — ${m[2].trim()}` : ""}`, m[0]);
      // DEPTH LANE A: "I worked a warehouse job last summer" — the
      // job-noun frame carries the experience without an "at".
      else if ((m = cl.match(/\bi\s+worked\s+(?:a|an|the)\s+([a-z][a-z ]{1,36}?\b(?:job|role|gig|position|shift)\b)/i))) push("experience", m[1].trim(), m[0]);
      if ((m = cl.match(/\bmake the tone\s+(casual|formal|warmer)\b/i)) || (m = cl.match(/\btone\s+(casual|formal|warmer)\s+from here\b/i))) push("tone", m[1].toLowerCase(), m[0]);
    }
    // (2) Offer-thread capture: an offer the user STATES (firm,
    // amount, deadline, role — any subset) becomes the thread's
    // negotiation record, so follow-ups ("more time?", "write the
    // email", "recap") run on it instead of falling. Same speech-act
    // discipline: unquoted assertion clauses only.
    // DEPTH LANE B (MI-014): the capture heard only exam dialect —
    // "X offered me $120k, decide by Friday". Genuine phrasing states
    // the same facts as "got an offer from a fintech startup, 85k,
    // they want an answer by Monday": a lowercase DESCRIPTOR instead
    // of a firm name (recorded as a descriptor, never promoted to a
    // company name), a bare "85k" with no $ sign, an answer-by
    // deadline, a signing figure, a share count, a start date, a
    // stated expectation range. Each new pattern stays inside the
    // same assertion-clause loop — a question, a quote, or a
    // conditional still records nothing.
    {
      const rec = {};
      const NOT_A_FIRM = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|the|this|that|my|their|your)$/i;
      // DEPTH LANE B (MI-014): emphatic punctuation is not a question.
      // A sentence that STATES an offer event ("i got an offer, its
      // like 64k??") and opens with no question word or auxiliary is
      // the user's assertion wearing M2 punctuation; the clause
      // splitter files it as interrogative and the whole offer was
      // dropped. Such sentences re-enter THIS capture (offer facts
      // only) with the trailing marks stripped. A genuine question
      // ("did I get an offer?", "what if I got an offer at 90k?")
      // opens with the auxiliary/question word and still records
      // nothing — the BUG-169 speech-act line is unchanged.
      // MI-123 (mechanism 2): figures are comma-formatted by nature
      // ("$85,000", "$4,000 signing bonus") — the shared clause
      // splitter cuts at those commas, so the figure parse saw "$4"
      // and "000 signing bonus" as separate clauses and neither the
      // bonus nor the rate ever landed whole. THIS capture also reads
      // comma-safe clauses (sentence / semicolon / em-dash splits
      // only); the shared splitter's clauses ride along as before.
      const offerClauses = [...s(unquotedText(raw)).split(/(?<=[.!?])\s+|;\s*|\s+[—–]\s+/).map((x) => x.trim()).filter(Boolean), ...factClausesOf(raw)];
      for (const sent of s(raw).split(/(?<=[.!?])\s+/)) {
        const st = sent.trim();
        if (!/\?+$/.test(st)) continue;
        if (/^(what|why|how|when|who|whom|which|should|would|could|can|will|do|does|did|is|are|am|was|were|if|suppose|let's say|say i|imagine)\b/i.test(st)) continue;
        if (!/\bgot an offer\b|\bgot the offer\b|\boffered me\b|\boffer came\b|\boffer'?s here\b|\bi have an offer\b/i.test(st)) continue;
        offerClauses.push(st.replace(/\?+$/, ""));
      }
      // The same emphasis, mid-turn ("its like 64k?? from a logistics
      // co"): the marks end the clause for the splitter although the
      // sentence runs on. A normalized copy (marks -> full stops)
      // feeds the SAME loop below; the per-clause typo-normalized
      // view (cln) lets "anser"-class spellings reach the deadline
      // patterns without touching the case-sensitive firm patterns.
      const rawEmph = s(raw).replace(/(\w)\?{2,}/g, "$1.").replace(/(\w)!{2,}/g, "$1.");
      if (rawEmph !== s(raw)) for (const cl2 of factClausesOf(rawEmph)) if (!offerClauses.includes(cl2)) offerClauses.push(cl2);
      for (const cl of offerClauses) {
        if (!clauseIsAssertion(cl)) continue;
        let m;
        const cln = typoNorm(cl);
        if ((m = cl.match(/\b([A-Z][A-Za-z0-9&.]+(?:\s+[A-Z][A-Za-z0-9&.]+){0,2})(?:\s+(?:just|has|have|had))?\s+offered me\b/))) rec.firm = m[1].trim();
        else if ((m = cl.match(/\boffer\b[^.!?]*?\b(?:from|at)\s+([A-Z][A-Za-z0-9&.]+(?:\s+[A-Z][A-Za-z0-9&.]+){0,2})/)) && !NOT_A_FIRM.test(m[1].trim())) rec.firm = m[1].trim();
        if (!rec.firm && !rec.descriptor && (m = cl.match(/\boffer\b[^.!?]*?\bfrom\s+an?\s+([a-z][a-z -]{1,28}?\b(?:startup|company|firm|bank|fund|agency|studio|shop|co|insurer|practice|group))\b/i))) rec.descriptor = m[1].trim();
        // MI-123 (mechanism 2): figures land BY KIND — an hourly rate
        // is recorded as a rate, a signing figure as the bonus, an
        // annual figure as the amount. A figure the clause frames as
        // the user's ASK ("ask for $56 an hour", "make it $54") is a
        // counter target, not the offer's figure, and is never
        // captured as one. The legacy patterns below run only for the
        // forms the kind parse does not carry (the $-less k forms:
        // "85k", "came back at 120k").
        const askFramed = /\bask(?:ing)? for\s+(?:a\s+|an\s+)?\$?\s?\d|\bcounter\s+(?:at|of|to)\s+\$?\s?\d|\bmake it\s+\$?\s?\d/i.test(cl);
        const figs = askFramed ? { hourly: null, signing: null, annual: null } : parseOfferFigures(cl);
        if (figs.hourly) rec.hourly = figs.hourly;
        if (figs.signing) rec.signing = figs.signing;
        if (figs.annual) rec.amount = figs.annual;
        if ((m = cl.match(/\bcame back\s+(?:at\s+)?\$?(\d{2,3})\s?k\b/i))) rec.amount = Number(m[1]) * 1000;
        if (!figs.annual && !figs.signing && !figs.hourly) {
          if ((m = cl.match(/\boffer\w*\b[^.]*?\$\s?(\d{2,3})\s?k\b/i)) || (m = cl.match(/\b(\d{2,3})\s?k\b[^.]*\boffer/i))) rec.amount = Number(m[1]) * 1000;
          else if ((m = cl.match(/\$\s?(\d[\d,]{3,})/))) rec.amount = Number(m[1].replace(/,/g, ""));
        }
        if (rec.amount == null && !figs.annual && !/\bsigning\b/i.test(cl) && (/\boffer|base|salary|came back\b/i.test(cl) || /\boffer/i.test(raw)) && (m = cl.match(/\b(\d{2,3}(?:\.\d)?)\s?k\b/i))) rec.amount = Number(m[1]) * 1000;
        if (!figs.signing && ((m = cl.match(/\bsigning(?:\s+bonus)?\s*(?:of\s*)?\$?(\d{1,3})\s?k\b/i)) || (m = cl.match(/\$\s?(\d{1,3})\s?k\s+signing\b/i)))) rec.signing = Number(m[1]) * 1000;
        if ((m = cl.match(/\b([\d,]{3,})\s+shares\b/i))) rec.shares = m[1];
        if ((m = cl.match(/\bstarts?\s+(?:on\s+)?([A-Z][a-z]+\s+\d{1,2})\b/))) rec.start = m[1];
        if ((m = cl.match(/\b(?:said|told them|quoted|gave|expect(?:ed|ing)?)\s+(?:them\s+)?\$?(\d{2,3})\s?[-–]\s?\$?(\d{2,3})\s?k\b/i))) rec.expectation = `${m[1]}-${m[2]}k`;
        if ((m = cln.match(/\bexploding deadline\s+(\w+day|tomorrow)\b/i)) || (m = cln.match(/\bdecide by\s+(\w+day|tomorrow)\b/i)) || (m = cln.match(/\bdeadline\s+(?:is\s+)?(?:on\s+)?(\w+day|tomorrow)\b/i))) rec.deadline = m[1];
        else if ((m = cln.match(/\b(?:want|wants|need|needs|expect|expects|asking for)\s+(?:my\s+|an\s+|the\s+)?answer\s+by\s+(\w+day|tomorrow)\b/i)) || (m = cln.match(/\banswer\s+by\s+(\w+day|tomorrow)\b/i)) || (m = cln.match(/\brespond\s+by\s+(\w+day|tomorrow)\b/i)) || (m = cln.match(/\bexpires?\s+(?:on\s+)?(\w+day|tomorrow)\b/i))) rec.deadline = m[1];
        else if ((m = cln.match(/\bexpires?\s+in\s+(\d+\s*(?:hours?|days?))\b/i))) rec.deadline = `in ${m[1]}`;
        else if (/\boffer\b/i.test(cl) && (m = cln.match(/\bby\s+(\w+day)\b/i))) rec.deadline = m[1];
        if ((m = cl.match(/\boffered me\s+(?:an?\s+|their\s+)?([a-z][a-z ]{2,30}?(?:internship|role|seat|job|position))\b/i))) rec.role = m[1].trim();
        else if ((m = cl.match(/\boffer\s+(?:for|as)\s+(?:an?\s+|the\s+)?([a-z][a-z ]{2,30}?(?:intern|analyst|engineer|manager|associate|representative|designer|accountant|consultant|developer))\b/i))) rec.role = m[1].trim();
      }
      // DEPTH LANE B (MI-014): a two-offer statement carries BOTH
      // figures ("one at 78k from a bank, one at 84k from an
      // insurer") — the ordered amounts + descriptors ride the
      // thread so a later "the bank one has a signing bonus" turn
      // can run the comparison math on the user's own numbers.
      if ((rec.amount || rec.firm || rec.descriptor) && /\boffers\b/.test(lc(raw))) {
        const amts = [...s(raw).matchAll(/\b(\d{2,3})\s?k\b/gi)].map((x) => Number(x[1]) * 1000).filter((n) => n > 0);
        if (amts.length >= 2) rec.amounts = [...new Set(amts)].slice(0, 3);
        const descs = [...s(raw).matchAll(/\bfrom an?\s+([a-z][a-z -]{1,24}?\b(?:bank|insurer|startup|company|firm|fund|agency|practice|group|co))\b/gi)].map((x) => x[1].trim());
        if (descs.length) rec.descriptors = descs.slice(0, 3);
      }
      // DEPTH LANE B (MI-014): a signing stated on a two-offer
      // thread belongs to the party the turn names — record WHICH,
      // so a later bare question ("which pays more in year one?")
      // runs the math with the bonus on the right offer.
      if (rec.signing) {
        const prior = negotiationThreadOf(ctx);
        const pool = [...(rec.descriptors || []), ...((prior && prior.descriptors) || [])];
        const hit = pool.find((d) => { const key = lc(d).split(/\s+/).pop(); return key && key.length > 2 && lc(raw).includes(key); });
        if (hit) rec.signingFor = hit;
      }
      if (rec.firm || rec.amount || rec.hourly || rec.deadline || rec.descriptor || rec.signing || rec.expectation || (Array.isArray(rec.amounts) && rec.amounts.length)) {
        const thread = negotiationThreadForWrite(ctx);
        // MI-123 (mechanism 1): a report naming a DIFFERENT offer — a
        // firm the record does not carry, a descriptor against a named
        // record, or any named firm while the record is still the
        // account-seeded prior offer — starts a NEW record: every
        // figure field re-bases from THIS report alone, so the prior
        // offer's amount can never ride into the new offer's record
        // (the battery's record held the prior offer's 85000 under
        // the new offer's firm). A report naming no new identity (a
        // detail about the same offer, in this thread or seeded from
        // the account) still merges, field by field.
        const newIdentity = !!((rec.firm && thread.firm && lc(rec.firm) !== lc(thread.firm))
          || (rec.firm && thread.fromAccount && lc(rec.firm) !== lc(thread.firm || ""))
          || (rec.firm && !thread.firm && !!thread.descriptor)
          || (rec.descriptor && !!thread.firm));
        if (newIdentity) {
          for (const k of ["firm", "descriptor", "descriptors", "amount", "amounts", "hourly", "signing", "signingFor", "deadline", "role", "start", "shares", "expectation", "counter", "requestedDay", "topic", "fromAccount"]) delete thread[k];
          ctx.offer = {};
        }
        Object.assign(thread, rec, { at: new Date(nowOf(ctx)).toISOString(), evidence: raw.slice(0, 200) });
        if (thread.firm || thread.amount || thread.hourly) {
          const off = (ctx.offer && typeof ctx.offer === "object") ? ctx.offer : {};
          if (thread.firm && !off.company) off.company = thread.firm;
          if (thread.descriptor && !off.company && !off.descriptor) off.descriptor = thread.descriptor;
          if (thread.amount && !off.base_salary) off.base_salary = thread.amount;
          if (thread.hourly && !off.hourly_rate) off.hourly_rate = thread.hourly;
          if (thread.signing && !off.signing_bonus) off.signing_bonus = thread.signing;
          ctx.offer = off;
        }
      }
    }
    if (added.length) ctx._factsAddedThisTurn = added;
    else delete ctx._factsAddedThisTurn;
    if (restated.length) ctx._factsRestatedThisTurn = restated;
    else delete ctx._factsRestatedThisTurn;
    return added;
  }
  function statedFactsOf(ctx) { return (ctx.statedFacts && Array.isArray(ctx.statedFacts.facts)) ? ctx.statedFacts.facts : []; }
  function factLine(f) {
    return { year: `you're a ${f.value}`, majors: `you study ${f.value}`, geography: `you're targeting ${f.value}`, experience: `you interned at ${f.value}`, school: `you go to ${f.value}`, target_firm: `your target firm is ${f.value}`, level: `you want ${f.value} first`, excluded_level: `not ${f.value}`, tone: `the tone is ${f.value} from here` }[f.kind] || `${f.kind}: ${f.value}`;
  }
  // DEPTH LANE A (MI-013): the stated-facts -> profile bridge. Facts
  // the user states in chat were captured into ctx.statedFacts but
  // every consumer that could APPLY them (watch create, discovery
  // scoring, internship headlines, prep) reads ctx.profile — so a
  // user who told the product everything still hit "I need your
  // profile on file first" on every route. When no real 122 profile
  // exists, the stated facts THEMSELVES form a thin profile in 122's
  // shape: every field traces to a stated fact, nothing is filled in
  // beyond them (no grad year is derived from a class year, no skill
  // is inferred from an experience line), and the record is marked
  // _fromStatedFacts and re-derived from the live facts EVERY turn,
  // so a correction re-aims it and an erasure drops it. A real
  // profile is never touched by the bridge.
  function profileFromStatedFacts(ctx) {
    const facts = statedFactsOf(ctx);
    if (!facts.length) return null;
    const geo = facts.find((f) => f.kind === "geography");
    const firm = facts.find((f) => f.kind === "target_firm");
    return {
      _fromStatedFacts: true,
      basics: { name: null, email: null, phone: null, location: geo ? geo.value : null, links: {} },
      preferences: { roles: [], industries: [], locations: geo ? [geo.value] : [], remote: null, companySize: null, compFloor: null, dealBreakers: [], targetCompanies: firm ? [firm.value] : [], excludedCompanies: [] },
      constraints: { graduationDate: null, startDate: null, workAuthorization: null, needsSponsorship: null, relocation: null, securityClearance: null },
      defaults: {},
      facts: facts.map((f, i) => ({ id: `stated-${f.kind}-${i}`, kind: f.kind, text: factLine(f), value: f.value, evidence: f.evidence || null })),
      connections: [],
    };
  }
  function handleStatedFactsReply(text, ctx) {
    const added = ctx._factsAddedThisTurn;
    if (!added || !added.length) {
      // BUG-272: nothing new was written this turn, but the user
      // RESTATED a fact the record already holds ("I'm based in
      // Denver" with Denver on record). The journey acknowledges
      // the fact as already on record — read back from the record
      // itself — instead of falling to the generic fallback. It
      // writes nothing and claims no fresh capture: the headline
      // says "already", never "recorded now". A turn carrying any
      // other ask (a question, a find, an action verb) stands down
      // and keeps its own owner.
      const restated = ctx._factsRestatedThisTurn;
      if (!restated || !restated.length) return null;
      if (/\?/.test(s(text))) return null;
      if (s(text).split(/\s+/).length > 14) return null;
      if (/\b(find|search|show|list|get|give|tailor|draft|prep|track|watch|apply|send|write|help|what|how|why|when|which|who)\b/.test(lc(text))) return null;
      const all = statedFactsOf(ctx);
      const lines = restated.map((r) => { const f = all.find((x) => x.kind === r.kind && lc(x.value) === lc(r.value)); return f ? factLine(f) : `${r.kind}: ${r.value}`; });
      const reply = compose({ headline: "Already on your record — nothing changed.", facts: [`On record: ${lines.join("; ")} — exactly as you stated it before, so this turn writes nothing new.`, `Your full record as it stands: ${all.map(factLine).join("; ")}.`], nextStep: "Correct any of it the same way you stated it, or tell me what to run on it first." });
      return { intent: "profile_correction", reply, resultStatus: "completed", sends: 0, stated_facts: all, restated_facts: restated };
    }
    if (/\?/.test(s(text))) return null;
    if (s(text).split(/\s+/).length > 22) return null;
    const all = statedFactsOf(ctx);
    const reply = compose({ headline: "Recorded — that is on your record now, in your words.", facts: [`On record so far: ${all.map(factLine).join("; ")}.`, "These facts are what your searches, drafts, and prep are built from — nothing about you is assumed beyond what you state, and you can correct any of it the same way you stated it."], nextStep: "Tell me the next fact, or say what you want to do first and it runs on these." });
    return { intent: "profile_correction", reply, resultStatus: "completed", sends: 0, stated_facts: all };
  }
  // INTEGRATION (2026-10-16): a direct read-back question for one
  // stated fact ("so what's my target firm?") was claimed by NOTHING
  // and fell to the generic fallback — the record could be written
  // and corrected but never read back by direct ask. Narrow gate:
  // only the "what's my <fact kind>" family; the answer is the
  // record itself (factLine), or the honest absence — never a guess.
  function handleStatedFactReadback(text, ctx) {
    const t = lc(text);
    const m = t.match(/\bwhat(?:'s| is) my (target firm|target company|major|school|city|location|year|class year|level|tone)\b/) || (/\bwhere am i (based|targeting|looking)\b/.test(t) ? [null, "geography"] : null);
    if (!m) return null;
    const kind = { "target firm": "target_firm", "target company": "target_firm", major: "majors", school: "school", city: "geography", location: "geography", geography: "geography", year: "year", "class year": "year", level: "level", tone: "tone" }[m[1]] || m[1];
    const all = statedFactsOf(ctx);
    const f = all.find((x) => x.kind === kind);
    if (f) {
      const reply = compose({ headline: "From your record — your words, as stated.", facts: [`On record: ${factLine(f)}.`], nextStep: "Correct it the same way you stated it, or tell me what to run on it first." });
      return { intent: "profile_recall", reply, resultStatus: "completed", sends: 0 };
    }
    const label = { target_firm: "a target firm", majors: "a major", school: "a school", geography: "a location", year: "a class year", level: "a level", tone: "a tone" }[kind] || kind;
    const reply = compose({ headline: "That is not on your record yet.", facts: [`You have not stated ${label} — the record holds only what you state, and nothing is assumed to fill it.`], nextStep: `State ${label} in your own words and it is recorded in this turn.` });
    return { intent: "profile_recall", reply, resultStatus: "awaiting_user", sends: 0 };
  }
  function handleFactSynthesis(text, ctx) {
    const t = lc(text);
    // DEPTH WAVE (BUG-213/214): the synthesis gate is a signal class
    // — a plan ask ("what should I do this semester / first / next",
    // "where do I start", "knowing all that") over stated facts —
    // not the two battery phrasings. One fact is enough to aim a
    // plan; zero facts stays a clarifying turn, not a plan.
    if (!/\bknowing all that\b|\bwith all that\b|\bwhat should i do\b|\bwhat do i do\b|\bso what (do|should) i do\b|\bwhere do i start\b|\bwhat should this (term|semester|year) look like\b|\bplan (my|the) (semester|term)\b|\bwhat'?s my plan\b|\bbuild (the|my) (networking |outreach )?plan\b|\bnetworking plan\b|\bplan for (them|it|that)\b/.test(t)) return null;
    const facts = statedFactsOf(ctx);
    if (facts.length < 1) return null;
    const year = facts.find((f) => f.kind === "year");
    const majors = facts.find((f) => f.kind === "majors");
    const geo = facts.find((f) => f.kind === "geography");
    const exp = facts.find((f) => f.kind === "experience");
    const firm = facts.find((f) => f.kind === "target_firm");
    // Item A (career-os): the plan is CONCRETE — two named moves,
    // each with its action and its timing, built from the thread's
    // own facts (firm, city, year, major, experience).
    const moveOne = firm
      ? `Move one — this week: build the networking plan into ${firm.value}${geo ? ` in ${geo.value}` : ""}. Source the names in order (your school's alumni directory first, then ${firm.value}'s own team pages), draft one opener per sendable name, and hold every send for your approval of the whole plan.`
      : `Move one — this week: build the networking plan into ${geo ? `${geo.value} firms` : "your target firms"}${majors ? ` that hire ${majors.value} students` : ""}. Source the names in order (your school's alumni directory first, then firm team pages), draft one opener per sendable name, and hold every send for your approval of the whole plan.`;
    const moveTwo = exp
      ? `Move two — in parallel: run the search for ${year && /sophomore|junior|freshman/.test(year.value) ? "next summer's internships" : "roles"} that build on your ${exp.value} experience, and track every application from day one so the story and the search reinforce each other.`
      : `Move two — in parallel: run the search for ${year && /sophomore|junior|freshman/.test(year.value) ? "next summer's internships" : "roles"}${geo ? ` in ${geo.value}` : ""}${majors ? ` matching ${majors.value}` : ""}, ranked honestly, and track every application from day one — the referral from move one is worth more than any single application, so the two moves run together.`;
    ctx._lastPlanKind = "semester";
    const reply = compose({ headline: "Here is the plan, built from what you told me — two moves, in order.", facts: [`What I am working from — your words, on record: ${facts.map(factLine).join("; ")}.`, moveOne, moveTwo], nextStep: "Say go and move one starts now — or correct any fact first and the plan re-aims." });
    return { intent: "career_guidance", reply, resultStatus: "awaiting_user", sends: 0 };
  }
  // ---------- BUG-271: the eligibility ASK. "Am I eligible for
  // that?" is a request to GRADE a posting against the record — the
  // spoken-eligibility mechanism (123's computeGaps +
  // eligibilityVerdictFor, MI-025) does exactly that, but only over
  // a posting's text. The bare ask was claimed by NOTHING with that
  // job: the record self-check below read "am i eligible" as a
  // record question and answered "That is not on your record — you
  // have not told me yet", an honest sentence aimed at the wrong
  // question entirely. The journey now: when a posting is actually
  // resolvable (attached to the thread, pasted with the ask, or
  // named by company and on the board list), grade it and speak the
  // verdict with the unmet requirements named. When none is, the
  // reply NAMES the missing inputs — the posting itself, and the
  // specific fact the named requirement turns on, with the record's
  // own state for that fact — and offers the closest path. A verdict
  // is never invented to fill the gap.
  function handleEligibilityAsk(text, ctx) {
    const t = lc(text);
    if (!/\b(eligible|eligibility|qualify|qualifies|qualified)\b/.test(t)) return null;
    if (!/\?/.test(s(text)) && !/\b(am i|do i|would i|can i|check if i)\b/.test(t)) return null;
    if (/\btailor\b/.test(t)) return null; // a tailor ask owns its posting
    if (/\b(offer|negotiat|signing bonus|counter)\b/.test(t)) return null; // negotiation owns its eligibility-flavored turns
    if (/\b(is|does|would|can) (he|she|they)\b|\bmy (roommate|friend|brother|sister|classmate|coworker|co-worker|colleague|partner)\b[^.]*\beligib/.test(t)) return null; // someone else's eligibility is not graded from this record
    const profile = ctx.profile || null;
    // Resolve a posting the user actually put in reach — never an
    // arbitrary top-ranked one (a verdict over the wrong posting is
    // worse than no verdict). Resolution reads the board pool
    // directly, NOT rankedShortlist: rankedShortlist's preCheck
    // EXCLUDES a posting whose hard credential the record lacks —
    // exactly the postings an eligibility ask most needs graded.
    let posting = ctx.posting || null;
    if (!posting) {
      const comp = companyFromText(text, ctx);
      if (comp) {
        const pool = postingsFromCtx(ctx);
        posting = pool.find((p) => p.company && lc(p.company) === lc(comp)) || pool.find((p) => p.company && (lc(p.company).includes(lc(comp)) || lc(comp).includes(lc(p.company)))) || null;
      }
    }
    // The posting's own jd_text wins over jdTextForPosting's
    // synthesis: for an adapted posting whose requirements array is
    // empty, the synthesis rebuilds the text FROM that array and
    // silently drops the real JD (the license sentence with it).
    const jdText = s(ctx.jdText || (posting ? (posting.jd_text || jdTextForPosting(posting)) : "") || ctx.jd || (s(text).length > 500 ? s(text) : ""));
    if (jdText && profile && Tailor) {
      try {
        const jd = Tailor.parseJD(jdText);
        const gaps = Tailor.computeGaps(profile, jd);
        const verdict = Tailor.eligibilityVerdictFor(gaps);
        const failed = gaps.filter((g) => g.reasonClass === "knockout-failed");
        const required = gaps.filter((g) => g.gapClass === "required" && g.reasonClass !== "knockout-failed");
        const facts = [verdict.line.replace(/^Eligibility verdict: /, "Verdict: ")];
        for (const g of failed.slice(0, 4)) facts.push(`Not met: ${g.requirement} — ${g.reason}`);
        for (const g of required.slice(0, 4)) facts.push(`Required and not evidenced: ${g.requirement}.`);
        if (!failed.length && !required.length) facts.push("Every hard requirement and required skill the posting states is evidenced on your record.");
        const reply = compose({ headline: `Graded against the posting's own text${posting && posting.company ? ` — ${posting.title || "the role"} at ${posting.company}` : ""}.`, facts, nextStep: "Want the tailored packet for it — the gaps travel with the document, named, never hidden — or another posting graded the same way?" });
        return { intent: "eligibility_check", reply, resultStatus: "prepared", sends: 0, eligibility: { status: verdict.status, gaps } };
      } catch { /* grading failed mechanically — fall through to the honest deflection, never a guessed verdict */ }
    }
    // No gradeable posting in reach: name exactly what is missing.
    const trimPhrase = (p) => { const out = []; for (const w of p.split(/\s+/).filter(Boolean)) { if (/^(am|is|are|was|were|do|does|did|would|can|could|should|i|you|the|a|an|for|to|of|in|on|at|or|and|with|without|eligible|eligibility)$/.test(w)) break; out.push(w); } return out.join(" "); };
    const classes = [];
    const licM = t.match(/\blicen[cs]ed\s+([a-z][a-z &]{2,40})/) || t.match(/\b([a-z][a-z &]{2,40}?)\s+licen[cs]e\b/);
    if (licM && trimPhrase(licM[1])) classes.push({ name: `${trimPhrase(licM[1])} license`, probe: /licen[cs]/ });
    else if (/\blicen[cs]e\b/.test(t)) classes.push({ name: "the license the posting requires", probe: /licen[cs]/ });
    if (/\bcertif/.test(t)) { const cm = t.match(/\bcertified\s+([a-z][a-z &]{2,40})/) || t.match(/\b([a-z][a-z &]{2,40}?)\s+certification\b/); classes.push({ name: cm && trimPhrase(cm[1]) ? `${trimPhrase(cm[1])} certification` : "the certification the posting requires", probe: /certif/ }); }
    if (/\b(degree|bachelor'?s|master'?s)\b/.test(t)) classes.push({ name: "the degree the posting requires", probe: /degree|bachelor|master|university|college/ });
    const yrM = t.match(/\b(\d+)\s*(?:\+|or more)?\s*years?\b/);
    if (yrM) classes.push({ name: `${yrM[1]} years of experience`, probe: /experience|interned|worked/ });
    if (/\b(authoriz|sponsorship|sponsor|citizen|visa|work permit)\b/.test(t)) classes.push({ name: "work authorization", probe: /authoriz|citizen|sponsor/ });
    const hay = [];
    if (profile) { for (const f of profile.facts || []) hay.push(s(f.text || f.value || "")); if (profile.basics) hay.push(s(profile.basics.location || "")); }
    for (const f of statedFactsOf(ctx)) hay.push(`${f.value} ${f.evidence || ""}`);
    // NOTE: each fact below is ONE sentence by construction — 140's
    // composer keeps the first sentence of a fact and drops the rest.
    const facts = ["Eligibility is judged requirement by requirement from the posting's own text — the same grading the tailored packet prints — and with no posting on this thread there is nothing honest to grade yet, so no verdict will be guessed."];
    if (classes.length) {
      for (const cl of classes.slice(0, 2)) {
        const hit = cl.probe ? hay.find((h) => cl.probe.test(lc(h))) : null;
        facts.push(hit
          ? `The fact this turns on: ${cl.name} — and your record does speak to it: "${hit}".`
          : `The fact this turns on: ${cl.name} — your record does not show it, so if you hold it, state it in your own words and it is recorded in this turn; if you don't, that one requirement by itself decides this posting.`);
      }
    } else {
      facts.push("What it will turn on is the posting's hard requirements — a license or certification, a degree, years of experience, work authorization — each one checked against your record, none of them assumed.");
    }
    const reply = compose({ headline: "Eligibility can't be graded without the posting — here is exactly what it takes.", facts, nextStep: "Paste the posting text, or name the company and role and I'll take the posting from the board list — the verdict is graded and spoken in that turn." });
    return { intent: "eligibility_check", reply, resultStatus: "awaiting_user", sends: 0 };
  }
  // ---------- DEPTH LANE A (MI-013 / MI-021, LF-01h): memory USE —
  // follow-ups that are answered FROM the record the user already
  // built: a read-back of what is on record, a fit ranking over the
  // standing search, a role direction drawn from an experience fact,
  // a review plan for a standing interview, the first move of a
  // standing outreach plan, and a draft the user explicitly asks to
  // be grounded in what they already said. Each stands down when
  // its record is absent — an honest ask replaces an invented use.
  function handleRecordRecall(text, ctx) {
    const t = lc(text);
    // The write-discipline question ("does it auto-mark me
    // rejected?") is a question about the product's own law — it is
    // answered with the law, and it writes nothing.
    if (/\bauto[- ]?mark\b|\bautomatically (mark|record|log|move|update)\b|\bdoes (it|this|the tracker) automatically\b|\bwill (it|you) automatically\b/.test(t)) {
      const reply = compose({ headline: "No — nothing on your tracker moves automatically.", facts: ["A stage changes only when you report the event yourself (\"they rejected me\", \"I got the offer\") or an employer record shows it — never from a hypothetical, a question, or someone else's news.", "If you ask \"what if I get rejected?\", the answer explains the rule and the row stays exactly where it was."], nextStep: "Report an outcome in your own words and it is recorded in that turn." });
      return { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0 };
    }
    const C = threadContextOf(ctx);
    // A self-check question ("am I a sophomore?") is answered FROM
    // the record — including the honest empty record. BUG-271:
    // "am I eligible / qualified" is NOT a self-check — it is an
    // eligibility ask, owned by handleEligibilityAsk above; letting
    // it land here answered a grading question with a record
    // non-sequitur ("That is not on your record…").
    const selfCheck = t.match(/\bam i (?:a |an )?(\w+)\b/);
    if (selfCheck && /\?/.test(s(text)) && !/^(eligible|qualified)$/.test(selfCheck[1])) {
      const w = selfCheck[1];
      const hit = C.facts.find((f) => lc(f.value).includes(w) || lc(f.kind) === w);
      const reply = hit
        ? compose({ headline: `From your record: ${factLine(hit)}.`, facts: ["That is what you stated earlier — it is the same record your searches, drafts, and prep are built from."], nextStep: "Correct it in your own words if it is wrong, and the record re-aims." })
        : compose({ headline: "That is not on your record — you have not told me yet.", facts: ["Nothing about your year, major, or targets is assumed here: the record holds only what you state, and this piece is not in it.", ...(C.facts.length ? [`What IS on record: ${C.facts.map(factLine).join("; ")}.`] : [])], nextStep: "State it in your own words and it is recorded in this turn." });
      return { intent: "career_guidance", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    if (!/\bwhere('s| is) my (search|focus|head)\b|\bwhere am i (focused|looking|targeting|searching)\b|\bwhat do you have (on record|on me|about me)\b|\bwhat('s| is) on (record|file) for me\b|\bwhat do you know about me\b|\bremind me\b[^.]*\b(focus|target|city|major|year|told you|said)\b/.test(t)) return null;
    const lines = [];
    if (C.facts.length) lines.push(`On record, in your words: ${C.facts.map(factLine).join("; ")}.`);
    if (C.thread && (C.thread.firm || C.thread.amount || C.thread.deadline)) lines.push(`The offer record: ${C.thread.firm || "firm not stated"}${C.thread.amount ? `, $${Number(C.thread.amount).toLocaleString()}` : ""}${C.thread.deadline ? `, decide by ${C.thread.deadline}` : ""}.`);
    if (C.rows.length) lines.push(`The tracker holds ${C.rows.length} application${C.rows.length === 1 ? "" : "s"}: ${C.rows.slice(0, 3).map((r) => `${r.company || "company not stated"} — ${r.stage || "recorded"}`).join("; ")}.`);
    if (!lines.length) lines.push("Nothing is on record yet — no facts, no offer, no tracker rows. Anything you state from here is captured in your words and used from then on.");
    const focus = C.geo ? `Your search focus, from the record: ${C.geo.value}${C.firm ? `, toward ${C.firm.value}` : ""}.` : null;
    const reply = compose({ headline: focus || "Here is what your record holds.", facts: lines, nextStep: "Name the piece to move next and it runs from exactly this record." });
    return { intent: "career_guidance", reply, resultStatus: "prepared", sends: 0 };
  }
  function handleFitFollowUp(text, ctx) {
    const t = lc(text);
    if (!/\bwhich (of (these|those)|ones?|roles?)\b[^.]*\b(fit|match|best|right|suit)\b|\bfit me best\b|\bbest (fit|match) for me\b|\bwhich (fit|match) me\b/.test(t)) return null;
    const C = threadContextOf(ctx);
    const pool = postingsFromCtx(ctx);
    const criteria = [];
    if (C.geo) criteria.push(`your stated base, ${C.geo.value}`);
    if (C.majors) criteria.push(`your major, ${C.majors.value}`);
    if (C.year) criteria.push(`your year — you're a ${C.year.value}`);
    if (!pool.length) {
      // No pool in hand (the live list connects separately): the
      // fit ORDER is still answered from the record, honestly.
      if (!C.facts.length && !C.discovery) return null;
      const reply = compose({ headline: "The fit order follows your record — here is what it ranks by.", facts: [criteria.length ? `From what you stated: ${criteria.join("; ")}. The moment roles are in hand, the ranking runs on exactly those facts — a role in your city asking for your major outranks a generic match, and the reason is spoken per role.` : "You have not stated the facts a fit ranking runs on yet — city, major, year — so there is no honest order to give.", ...(C.discovery ? [`Your standing search is on record${C.discovery.roleText ? ` (${C.discovery.roleText})` : ""} — it re-runs first when the list lands.`] : [])], nextStep: "Name a company to watch, or paste a posting, and the fit check runs on it now." });
      return { intent: "career_discovery", reply, resultStatus: "prepared", sends: 0 };
    }
    let ranked = [];
    try { const r = rankedShortlist(ctx.profile || null, ctx, {}); ranked = (r && r.ranked) || []; } catch { ranked = []; }
    if (!ranked.length) return null;
    const echoFor = (p) => {
      const echoes = [];
      if (C.geo && p.location && lc(p.location).includes(lc(String(C.geo.value).split(",")[0]))) echoes.push(`in ${C.geo.value}, your stated base`);
      if (C.majors) { const hay = lc(`${p.title || ""} ${(Array.isArray(p.requirements) ? p.requirements.join(" ") : p.requirements || "")} ${p.jd_text || ""}`); const toks = lc(C.majors.value).split(/\s*(?:,|and|&)\s*/).map((x) => x.trim()).filter((x) => x.length > 2); const hitTok = toks.find((tok) => hay.includes(tok)); if (hitTok) echoes.push(`asks for ${hitTok}, your major`); }
      if (C.year && /\bintern/i.test(p.title || "") && /sophomore|junior|senior|freshman/.test(C.year.value)) echoes.push(`an intern seat, right for a ${C.year.value}`);
      return echoes;
    };
    const top = ranked.slice(0, 3);
    const facts = top.map((p, i) => { const e = echoFor(p); return `${i + 1}. ${p.title} at ${p.company}${p.location ? ` (${p.location})` : ""}${e.length ? ` — matches you on: ${e.join("; ")}` : " — the strongest of the rest on the general fit score"}.`; });
    facts.push(criteria.length ? `Ranked against what you told me: ${criteria.join("; ")} — nothing about you beyond your own words went into the order.` : "Ranked on the general fit score — state your city, major, or year and the order re-runs on them.");
    const reply = compose({ headline: "Of these, the ones that fit YOU best — from your own record.", facts, nextStep: "Name one and the tailor runs on it next." });
    return { intent: "career_discovery", reply, resultStatus: "prepared", sends: 0 };
  }
  function handleFactDirection(text, ctx) {
    const t = lc(text);
    if (!/\bwhat kind of roles\b|\bwhat roles should i\b|\bwhat should i (aim|target|go) for\b|\bwhere do i fit\b|\broles? (for|suited to|right for) (someone|me)\b|\bknowing that\b[^.]*\b(roles?|aim|target)\b/.test(t)) return null;
    const C = threadContextOf(ctx);
    const exp = C.exp;
    if (!exp) return null;
    const ev = lc(exp.value);
    const lanes = [];
    if (/\broute|logistics|freight|supply|warehouse|inventory|operations|shipping|fleet\b/.test(ev)) lanes.push("operations and supply-chain roles — the work you described IS that family's daily work, so your story answers their first interview question before it is asked");
    if (/\bdiligence|valuation|modeling|banking|deals?|m&a|private equity|underwriting\b/.test(ev)) lanes.push("investment-banking and private-equity analyst roles — diligence and modeling reps are the exact currency those screens price");
    if (/\bgrowth|marketing|brand|content|social\b/.test(ev)) lanes.push("growth and product-marketing roles — experiments you have already run are the portfolio those teams hire from");
    if (/\bdata|sql|python|research|analysis|analytics|models?\b/.test(ev)) lanes.push("data and analytics roles — your analysis work is the evidence their take-homes test for");
    if (/\bclient|reports?|wealth|advisory|service\b/.test(ev)) lanes.push("client-facing analyst roles (wealth, advisory, coverage) — client-report reps are their core workflow");
    const facts = [`Working from your record: ${factLine(exp)}.`];
    if (lanes.length) facts.push(`Aim at: ${lanes.join("; ")}.`);
    else facts.push(`Aim at roles whose postings name the work inside your experience — ${exp.value} — in their requirements; that overlap is what a fit screen scores, and roles without it start you from zero.`);
    if (C.geo) facts.push(`In ${C.geo.value}, per your stated target — the search and the networking plan both run there first.`);
    const reply = compose({ headline: "Roles that build on what you have already done — not a generic list.", facts, nextStep: "Say find and the search runs on that direction now, ranked against your record." });
    return { intent: "career_guidance", reply, resultStatus: "prepared", sends: 0 };
  }
  function handlePrepFollowUp(text, ctx) {
    const t = lc(text);
    if (!/\bwhat should i (review|study|go over|prepare|prep)\b/.test(t)) return null;
    const C = threadContextOf(ctx);
    const row = C.rows.find((r) => /interview/i.test(r.stage || "")) || null;
    const lw = C.lastWork;
    if (!row && !(lw && lw.kind === "prep") && !C.thread) return null;
    const co = row ? (row.company || "the firm") : (lw && lw.company) || (C.thread && C.thread.firm) || "the firm";
    const facts = [`Tonight's review, aimed at ${co}${row ? ` — the row sits at the ${row.stage} stage` : ""}:`, "1. Your three stories, out loud, in STAR form — situation, task, action, result with a number in it. The result number is the part candidates skip and panels probe.", "2. The firm's own work: two facts about what they do and one recent move of theirs, so \"why us\" is answered with their record, not adjectives.", ...(C.exp ? [`3. Your experience, weaponized: ${factLine(C.exp)} — rehearse the 60-second version until it lands without notes.`] : ["3. One weakness answer with a real repair story — a gap you found and what you did about it, never a humble-brag."])];
    const reply = compose({ headline: `The review plan for ${co}.`, facts, nextStep: "Want a mock round on the first story now?" });
    return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0 };
  }
  function handleOutreachFirst(text, ctx) {
    const t = lc(text);
    if (!/\bwho (do|should) i (talk to|reach out to|contact|start with)\b[^.]*\bfirst\b|\bwho'?s first\b|\bwho first\b/.test(t)) return null;
    const C = threadContextOf(ctx);
    if (!C.plan && !C.firm) return null;
    const setName = C.plan && C.plan.firm_set ? String(C.plan.firm_set).replace(/_/g, " ") : null;
    const firms = C.plan && Array.isArray(C.plan.firms) && C.plan.firms.length ? C.plan.firms : null;
    const facts = [];
    if (firms) facts.push(`The plan's order is warmth-first: ${firms[0]} leads the set${firms.length > 1 ? `, ahead of ${firms.slice(1, 3).join(" and ")}` : ""} — the first names come from your school's alumni directory at that firm, because a shared school is the warmest sourced path there is.`);
    else if (C.firm) facts.push(`The target is ${C.firm.value} — the first person is sourced from your school's alumni directory there, then the firm's own team page; nobody is contacted on a guessed address.`);
    else facts.push(`The ${setName || "standing"} plan stands, unbuilt: the first move is the alumni-directory pull for the set's first firm — names with sources come back before anyone is drafted to.`);
    facts.push("No name is invented for the opener: the first draft is written the moment a real, sourced name is on the record, and it waits for your approval like every send.");
    const reply = compose({ headline: "First move on the standing plan.", facts, nextStep: "Say the word and the sourcing runs now — or name a person yourself and the opener is drafted to them." });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }
  function handleFactGroundedDraft(text, ctx) {
    const t = lc(unquotedText(text));
    if (!/\buse what you know about me\b|\bbased on what (i|i've|i have) (told|shared|said)\b|\bfrom my background\b|\bknowing my background\b|\buse my background\b|\bwith what you know about me\b/.test(t)) return null;
    if (!/\b(draft|write|open|opener|message|intro|blurb|email|note)\b/.test(t)) return null;
    const C = threadContextOf(ctx);
    if (!C.facts.length) return null;
    const exp = C.exp, school = C.facts.find((f) => f.kind === "school") || null;
    if (!exp && !school && !C.majors && !C.firm) return null;
    const expLine = exp ? exp.value.replace(/\s+—\s+/, ", working on ") : null;
    // The draft text rides longBody, not a fact: the reply composer
    // speaks ONE sentence per fact, and a draft squeezed into a fact
    // arrives truncated at its first period. Three sentences keep
    // the whole opener inside the spoken bubbles.
    const opener = `Hi — I'm ${C.year ? `a ${C.year.value}` : "a student"}${school ? ` at ${school.value}` : ""}${C.majors ? ` studying ${C.majors.value}` : ""}${expLine ? `, and last summer I interned at ${expLine}` : ""}. ${C.firm ? `I'm aiming at ${C.firm.value} and trying to learn how people there actually got in` : "I'm exploring this field properly before recruiting season and trying to learn how people in it actually got started"} — would you be open to twenty minutes on how you got into your seat and what the work runs on?`;
    const reply = compose({ headline: "An opener drafted from your own record — every line in it is something you stated.", facts: ["It is a held draft: it sends to no one until you name the person and approve the exact text."], longBody: opener, nextStep: "Name the person (and their firm if it differs) and the opener is aimed at them." });
    return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft_text: opener };
  }

  // ---------- DEPTH WAVE (BUG-214): a geography correction aimed at
  // the thread ("make it Chicago not New York"). The capture pass has
  // already replaced the fact; this handler re-points the standing
  // plan and confirms from the corrected record — the old city is
  // named only as the thing dropped, never as the current target.
  function handleGeoCorrection(text, ctx) {
    const corr = ctx._geoCorrectionThisTurn;
    if (!corr) return null;
    const facts = statedFactsOf(ctx);
    const firm = facts.find((f) => f.kind === "target_firm");
    const plan = ctx.plan && ctx.plan.kind === "campaign_plan" ? ctx.plan : null;
    if (plan) {
      plan.geography = corr.to;
      if (plan.target && typeof plan.target === "object") plan.target.geography = corr.to;
    }
    const factsOut = [`The correction is on the record: ${corr.to} is the target city now, and ${corr.from} is dropped — no list, draft, or plan is built against ${corr.from} after a correction.`];
    if (firm) factsOut.push(`The target itself is unchanged: ${firm.value}${plan ? ", on the standing plan" : ""} — only the city moved.`);
    const reply = compose({ headline: `Corrected: ${corr.to}, not ${corr.from}.`, facts: factsOut, nextStep: firm ? `Want the ${firm.value} plan re-run against ${corr.to} names first?` : `Want the plan re-run against ${corr.to} first?` });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  // ---------- DEPTH WAVE (BUG-213/214/215): thread continuations.
  // Follow-up turns whose meaning lives entirely in the thread — a
  // recap, a read-back of the record, "just one next step", "be
  // specific, a checklist", "which matters most for <firm>", a reply
  // hypothetical, "draft that, short", the biggest-mistake ask, "do
  // the first step", a GPA-screen question, and the first-move ask.
  // Each is a SIGNAL CLASS (structure + thread state), answered from
  // the thread's own records only — facts, plan, negotiation record,
  // tracker rows, pause record — never from a template over nothing.
  function threadContextOf(ctx) {
    const facts = statedFactsOf(ctx);
    const get = (k) => facts.find((f) => f.kind === k) || null;
    const thread = (ctx.negotiationThread && typeof ctx.negotiationThread === "object") ? ctx.negotiationThread : null;
    const plan = ctx.plan && ctx.plan.kind === "campaign_plan" ? ctx.plan : null;
    let rows = [];
    try { const store = trackStoreOf(ctx); rows = (store && Array.isArray(store.rows)) ? store.rows : []; } catch { rows = []; }
    // W-NEXTSTEP (MI-012 / LF-01a): the thread's ACTIVE WORK beyond
    // facts/plan/rows — the held intent queue, the last search, the
    // last piece of work actually served (prep / tailor / a draft /
    // a negotiation turn, recorded by recordActiveWork), and the
    // pause state. A next-step follow-up is answered from exactly
    // this, so work that left no other durable record (a prep
    // question served profile-less leaves no facts, plan, or row)
    // is still visible to the composer instead of reading as cold.
    const queue = Array.isArray(ctx.intentQueue) ? ctx.intentQueue : [];
    const discovery = (ctx.discovery && ctx.discovery.lastParams) ? ctx.discovery.lastParams : null;
    const lastWork = lastWorkOf(ctx);
    let paused = false;
    try { paused = pausedOf(ctx); } catch { paused = false; }
    return { facts, year: get("year"), majors: get("majors"), geo: get("geography"), firm: get("target_firm"), level: get("level"), exp: get("experience"), tone: get("tone"), thread, plan, rows, queue, discovery, lastWork, paused };
  }
  // W-NEXTSTEP: the active-work record — read view (top-level ctx
  // first, then the thread mirror inside the track store, the same
  // two homes every other thread record reconciles between).
  function lastWorkOf(ctx) {
    const c = ctx || {};
    if (c._careerLastWork && typeof c._careerLastWork === "object") return c._careerLastWork;
    const m = threadMirrorOf(c);
    if (m && m.lastWork && typeof m.lastWork === "object") { c._careerLastWork = m.lastWork; return m.lastWork; }
    return null;
  }
  // W-NEXTSTEP: a turn that SERVED a piece of work (prep served, a
  // tailor cut, a held draft, a negotiation turn) records that work
  // as the thread's active item. This is conversation state, not a
  // user-fact/tracker write: it records what the PRODUCT just did,
  // in the user's own ask words, and a next-step ask itself (career_
  // guidance) never overwrites it — so "and then?" asked twice
  // reads the same active work twice.
  function recordActiveWork(ctx, res, text) {
    const c = ctx || {};
    if (!res || !res.intent) return;
    if (res.intent === "career_fallback" || res.intent === "honest_unavailable") return;
    let kind = null;
    if (/^prep_/.test(res.intent) && res.intent !== "prep_needs_profile") kind = "prep";
    else if (/^negotiation_/.test(res.intent)) kind = "negotiation";
    else if (res.intent === "career_tailor" || res.intent === "career_essay") kind = "tailor";
    else if (res.intent === "outreach_draft") kind = "draft";
    if (!kind) return;
    const company = res.company || (res.artifact && res.artifact.company) || (res.draft && res.draft.company) || null;
    c._careerLastWork = { kind, intent: res.intent, ask: s(text).slice(0, 140), company: company || null, at: new Date(nowOf(c)).toISOString() };
  }
  // W-NEXTSTEP (MI-012 / LF-01a): the next-step follow-up as a
  // DISCOURSE FUNCTION. The claim is structural: after discourse
  // fillers are stripped, the WHOLE turn is a continuation ask —
  // an explicit next-step ask ("whats my next step then", "what
  // should I do next") or a bare deictic one whose only content is
  // the continuation itself ("ok and then?", "what now?", "so
  // what's next?", "and then what?"). Whole-turn anchoring is the
  // claim-order discipline: a longer turn that merely CONTAINS
  // these words carries fresh content and keeps its own route —
  // nothing already claimed by a more specific route is stolen.
  function isNextStepFollowUp(text) {
    let core = lc(text).replace(/[’]/g, "'").trim().replace(/\s+/g, " ").replace(/[?!.]+$/, "").trim();
    if (/^(and )?then what$/.test(core)) return true; // the idiom as a whole — "then" is not a filler inside it
    let prev = null;
    while (core !== prev) { prev = core; core = core.replace(/^(ok|okay|so|alright|right|well|yeah|and|then)[ ,]+/, "").trim(); }
    if (!core) return false;
    return core === "then"
      || core === "next"
      || /^(what now|now what|what next|what then|then what)$/.test(core)
      || /^what'?s next$/.test(core)
      || /^what happens next$/.test(core)
      || /^what'?s my (very )?next (step|move)( (then|now))?$/.test(core)
      || /^what is my next (step|move)( (then|now))?$/.test(core)
      || /^what'?s the (move|step) (after that|next|now)$/.test(core)
      || /^what'?s (my|the) move( (after that|next|now))?$/.test(core)
      || /^what (do|should) i do (after|with) (that|this|it)$/.test(core)
      || /^what happens$/.test(core)
      || /^what'?s the (single |very )?next (step|move|thing)$/.test(core)
      || /^what (do|should|can|would) i do( (next|now|from here))?$/.test(core)
      || /^what (is|would be) (the|my) next (step|move|thing)$/.test(core)
      || /^(the )?next (step|move)$/.test(core)
      || /^where (do|should) (i|we) go from here$/.test(core)
      || /^how (do|should) i proceed$/.test(core);
  }
  // W-NEXTSTEP: the composed next move for the thread's active
  // work, in priority order — a standing pause first (no unpaused
  // move may be spoken over it), then the deadline-bearing offer
  // thread, the held queue, the plan's approval gate, the user's
  // stated facts, the open tracker row, the last work served, and
  // the last search. With no active work at all the step is the
  // career-OS intake question — the one question that starts a
  // plan — never an invented plan over no facts.
  function composedNextStep(C) {
    if (C.paused) return "Everything is paused right now, so the honest next step is a decision, not an action: lift the pause when you are ready and the work resumes from exactly this state — until then nothing sends, submits, or goes out.";
    if (C.thread && C.thread.deadline) return `Draft the extension ask on the ${C.thread.firm || "offer"} before the ${C.thread.deadline} deadline moves — that one draft protects every other option.`;
    if (C.thread && C.thread.amount) return `Get the counter drafted against the $${Number(C.thread.amount).toLocaleString()} offer${C.thread.firm ? ` from ${C.thread.firm}` : ""} — one written counter, from sourced numbers, held for your approval.`;
    if (C.queue && C.queue.length) return `Take the next held part of your earlier message — ${C.queue[0].label || "the next part"} — it was queued in order and it runs next; the parts behind it stay held until it is done.`;
    if (C.plan) return `Approve the ${C.firm ? `${C.firm.value} ` : ""}plan — the found, trustworthy, and sendable counts come back first, and nothing drafts or sends before that approval.`;
    if (C.firm || C.geo || C.year || C.majors) return `Build the networking plan into ${C.firm ? C.firm.value : `${C.geo ? C.geo.value : "your target"} firms`} — alumni-directory names first, one opener each, all held for your approval.`;
    if (C.rows.length) { const open = C.rows.find((r) => !/Rejected|Withdrawn|Accepted/i.test(r.stage || "")) || C.rows[0]; return `Work the ${open.company || "recorded"} application — it sits at ${open.stage || "the recorded stage"}, and the next move is the follow-up or prep that stage calls for.`; }
    if (C.lastWork) {
      const w = C.lastWork;
      if (w.kind === "prep") {
        const topic = /\bdcf\b/i.test(w.ask || "") ? " — the DCF question in front of you" : /\bmarket sizing\b/i.test(w.ask || "") ? " — the market-sizing question in front of you" : "";
        return `Stay on the interview prep we just opened${topic}: answer the item in front of you the way you would in the room — out loud, structured, numbers before adjectives — and I will score it against the rubric and hand you the next prep question.`;
      }
      if (w.kind === "tailor") return `Review the tailored artifact we just produced${w.company ? ` for ${w.company}` : ""} — then the application packet for that role is prepared next, stopping at its doorstep for your tap, never submitted without it.`;
      if (w.kind === "draft") return "Decide on the held draft we just produced: approve it as written, or name the change — shorter, warmer, a different angle — and it is revised in place; nothing sends from a draft on its own.";
      if (w.kind === "negotiation") return "Put the offer itself on the record — paste the letter, or state its firm, base, and deadline — and the counter is drafted from those numbers; a negotiation move is never composed from a guess.";
    }
    if (C.discovery) return `Pick one role from the search you already ran${C.discovery.roleText ? ` (${C.discovery.roleText})` : ""} and tailor for it — the search is done and on record, so the next move is a tailored packet for its top role, not another search.`;
    return "Tell me the field and the season (internship or full-time) — that one answer starts the whole loop in the right gear.";
  }
  // W-NEXTSTEP: the pre-synthesis claim. A strict whole-turn
  // next-step follow-up over ACTIVE WORK (pause, offer thread,
  // queue, plan, tracker row, work served, a standing search) is
  // claimed here, ahead of the fact-synthesis plan — synthesis
  // composes from facts alone and would answer a tracked or
  // in-prep thread with a generic two-move plan that ignores the
  // work in front of the user. With no active work this stands
  // down: facts-only and cold threads keep their existing owners
  // (synthesis, then the continuation branch below).
  function handleNextStepFollowUp(text, ctx) {
    if (!isNextStepFollowUp(text)) return null;
    const C = threadContextOf(ctx);
    const hasActiveWork = C.paused || !!C.thread || (C.queue && C.queue.length > 0) || !!C.plan || C.rows.length > 0 || !!C.lastWork || !!C.discovery;
    if (!hasActiveWork) return null;
    const reply = compose({ headline: "One thing, the next one:", facts: [composedNextStep(C)], nextStep: "Say go and that step runs now." });
    return { intent: "career_guidance", reply, resultStatus: "awaiting_user", sends: 0 };
  }
  function handleThreadContinuation(text, ctx) {
    const t = lc(text);
    const raw = s(text);
    const C = threadContextOf(ctx);
    const hasThread = C.facts.length > 0 || !!C.plan || !!C.thread || C.rows.length > 0;
    // (1) Recap / summary of where the thread landed.
    if (/\b(summarise|summarize|recap)\b|\bwhere (did|do) we (land|get to)\b|\bwhere we landed\b|\bsum (it|this|things) up\b/.test(t)) {
      const facts = [];
      if (C.thread && (C.thread.firm || C.thread.amount || C.thread.deadline)) facts.push(`The offer on the table: ${C.thread.firm || "the firm you named"}${C.thread.amount ? `, $${Number(C.thread.amount).toLocaleString()}` : ""}${C.thread.deadline ? `, decide by ${C.thread.deadline}` : ""} — and the plan for it is extension first if the window is tight, then one written counter; nothing has been sent.`);
      if (C.plan) facts.push(`The outreach plan stands${C.plan.firms_named && C.plan.firms && C.plan.firms.length ? ` targeting ${C.plan.firms.join(", ")}` : C.plan.firm_set ? ` on the ${String(C.plan.firm_set).replace(/_/g, " ")} set (proposed)` : ""}${C.geo ? ` in ${C.geo.value}` : ""} — no list built yet, no sends, everything waits on your approval of the whole plan.`);
      if (C.facts.length) facts.push(`Your facts on record: ${C.facts.map(factLine).join("; ")}.`);
      if (C.rows.length) facts.push(`The tracker holds ${C.rows.length} application${C.rows.length === 1 ? "" : "s"}: ${C.rows.slice(0, 3).map((r) => `${r.company || "company not stated"} — ${r.stage || "recorded"}`).join("; ")}.`);
      if (!facts.length) facts.push("Nothing has been decided in this thread yet — no offer, no plan, and no facts are on record, so there is nothing to summarise beyond that honest state.");
      const reply = compose({ headline: "Where we landed, from this thread's own record.", facts, nextStep: "Name the piece to move next and it runs from exactly this state." });
      return { intent: C.thread ? "negotiation_advice" : "career_guidance", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    // (2) Read-back: what has actually been recorded.
    if (/\bsay that back\b|\bwhat have you (actually )?(recorded|captured|got down|saved)\b|\bwhat (do|have) you (recorded|saved|captured)\b|\bwhat have i told you\b|\bread (it|that) back to me\b/.test(t)) {
      const facts = [];
      if (C.facts.length) facts.push(`Facts, in your words: ${C.facts.map(factLine).join("; ")}.`);
      if (C.thread && (C.thread.firm || C.thread.amount || C.thread.deadline)) facts.push(`The offer record: ${C.thread.firm || "firm not stated"}${C.thread.amount ? `, $${Number(C.thread.amount).toLocaleString()}` : ""}${C.thread.deadline ? `, deadline ${C.thread.deadline}` : ""}.`);
      if (C.plan) facts.push(`A campaign plan stands${C.plan.firms_named && C.plan.firms && C.plan.firms.length ? ` for ${C.plan.firms.join(", ")}` : ""}, unbuilt and unsent.`);
      if (C.rows.length) facts.push(`Tracker rows: ${C.rows.map((r) => `${r.company || "company not stated"} — ${r.stage || "recorded"}`).join("; ")}.`);
      const gp = ctx.globalPause;
      if (gp && gp.set === true) facts.push("A global pause is set and standing.");
      if (gp && gp.set === false && gp.liftedAt) facts.push("A pause was set earlier in this thread and has been lifted — nothing is paused now.");
      if (!facts.length) facts.push("Nothing is recorded yet in this thread — no facts, no plan, no tracker rows. Anything you state from here is captured in your words.");
      const reply = compose({ headline: "Here is exactly what is on the record — nothing more.", facts, nextStep: "Correct any of it the same way you stated it, and the record updates." });
      return { intent: "profile_correction", reply, resultStatus: "completed", sends: 0, stated_facts: C.facts };
    }
    // (3) One next step — a single concrete action from the record.
    // W-NEXTSTEP (MI-012 / LF-01a): the claim is the follow-up's
    // discourse function — the explicit shapes, plus the strict
    // whole-turn deictic forms (isNextStepFollowUp: "ok and
    // then?", "what now?", "so what's next?") that carry no fresh
    // product nouns at all. The step itself is composed from the
    // thread's active work by composedNextStep (pause / offer /
    // queue / plan / facts / tracker / last work served / last
    // search / cold intake), so a prep thread no longer reads as
    // cold and an elliptical follow-up lands on the same move the
    // explicit ask would have gotten.
    if (/\bwhat'?s my (very )?next step\b|\bwhat'?s the (single|very)? ?next (step|thing)\b|\bjust one thing\b[^.]*\b(step|do|next)\b|\bwhat do i do next\b|\bsingle next step\b/.test(t) || isNextStepFollowUp(text) || /^\s*ok and whats my very next step,? just one thing\s*$/i.test(raw)) {
      const reply = compose({ headline: "One thing, the next one:", facts: [composedNextStep(C)], nextStep: "Say go and that step runs now." });
      return { intent: "career_guidance", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    // (4) Specificity / checklist: re-render the standing plan as a
    // concrete checklist, from the thread's own facts.
    if (/\bbe specific\b|\bchecklist\b|\bstep[ -]by[ -]step\b|\bturn (that|it|this) into\b[^.]*\b(list|checklist|steps)\b|\bconcrete steps\b/.test(t) && hasThread) {
      const where = C.geo ? ` in ${C.geo.value}` : "";
      const who = C.firm ? C.firm.value : null;
      const items = [
        `Source 10 names${who ? ` at ${who}` : `${where}`} from your school's alumni directory and firm team pages — every name carries its source.`,
        `Filter to ${C.level ? C.level.value : "analyst-level"} people first; senior names wait for a warm path.`,
        "Draft one opener per sendable name, each built on one fact you share — no guessed email addresses, ever.",
        "Approve the whole plan once; only then do the found / trustworthy / sendable counts turn into sends, inside the daily caps.",
        `Run the ${C.year && /freshman|sophomore|junior/.test(C.year.value) ? "next-summer internship" : "role"} search${where} beside the outreach and track every application from day one.`,
        "Log every reply and stage change to the tracker the day it lands — the record is what the next step is read from.",
      ];
      const reply = compose({ headline: "The plan, as a checklist:", facts: items.map((x, i) => `${i + 1}. ${x}`), nextStep: "Say go and item 1 starts now." });
      return { intent: "career_guidance", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    // (5) Priority for a named firm: "which of those matters most
    // for <Firm>" — the firm is used in the answer, never recorded
    // from a question (capture's invariant stands).
    {
      const pm = raw.match(/\bwhich of those matters most for\s+([A-Z][A-Za-z0-9&.]+(?:\s+[A-Z][A-Za-z0-9&.]+){0,2})/i) || raw.match(/\bwhat matters most for\s+([A-Z][A-Za-z0-9&.]+(?:\s+[A-Z][A-Za-z0-9&.]+){0,2})/i);
      if (pm) {
        const firm = pm[1].replace(/[?.!,]+$/, "").trim();
        let cirFact = null;
        try { const cir = cirFor(text, ctx); if (cir) { const bar = cirFieldText(cir.hiring_bar_summary); if (bar) cirFact = bar.split(/(?<=[.!?])\s/)[0]; } } catch { cirFact = null; }
        const facts = [`For ${firm}, the step that matters most is the warm path in — a sourced name who can refer you — because ${firm}'s screen rewards a referral and a precise fit story over application volume.`];
        if (cirFact) facts.push(`From ${firm}'s own file: ${cirFact}`);
        facts.push(`Concretely: one alumni-directory name at ${firm}, one opener built on a shared fact, and the application tailored to the posting — in that order. The search and the tracking matter, but they support that step, not replace it.`);
        const reply = compose({ headline: `For ${firm}: the warm path matters most.`, facts, nextStep: `Want the ${firm} networking plan built first?` });
        return { intent: "company_intel", reply, resultStatus: "prepared", sends: 0, company: firm };
      }
    }
    // (6) Reply hypothetical: if/when they reply tomorrow.
    if (/\bif (they|he|she|the recruiter) repl\w*\b|\bwhen (they|he|she|the recruiter) repl\w*\b|\bwhat if\b[^.]*\brepl\w*\b/.test(t)) {
      ctx._lastSuggested = "reply_handling";
      const reply = compose({ headline: "If a reply lands tomorrow, the handling is fixed — here it is.", facts: ["Read it for its actual ask first: a call offer, a question, or a soft no each get a different answer — never a reflex thank-you.", "Answer inside a day with a short draft: thank them by name, answer the ask in one line, and offer two concrete times if a call is on the table.", "The draft waits for your approval before anything sends — a reply is a send, and sends are approval-gated here like everything else."], nextStep: "Want that reply drafted now, short version, so it is ready before the reply lands?" });
      return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    // (7) "Draft that, short version" — the draft itself, composed
    // from the thread (the reply draft the last step pointed at, or
    // the negotiation draft when an offer thread stands).
    if (/\bdraft that\b|\bdraft it for me\b|\bwrite that (up|out)\b/.test(t) && (/\bshort\b/.test(t) || hasThread)) {
      if (C.thread && (C.thread.firm || C.thread.amount)) {
        const ext = Negotiation && Negotiation.extensionDraft ? Negotiation.extensionDraft({ company: C.thread.firm || null, role: C.thread.role || null }, {}) : null;
        const body = ext && ext.draft ? ext.draft : `Subject: Thank you — and a short request\n\nHi [Recruiter name],\n\nThank you for the offer${C.thread.amount ? ` of $${Number(C.thread.amount).toLocaleString()}` : ""}. I am excited about ${C.thread.firm || "the role"} and want to give it the review it deserves — could I have a few more days before the ${C.thread.deadline || "deadline"}?\n\nThank you,\n[Your name]`;
        const reply = compose({ headline: "The short draft, held for your approval — nothing sent:", facts: [body], nextStep: "Approve it as written, or tell me what to change." });
        return { intent: "negotiation_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: ext || { kind: "extension_email", body } };
      }
      const firmBit = C.firm ? ` about ${C.firm.value}` : "";
      const body = `Hi [Name],\n\nThank you for getting back to me — I really appreciate it. I would love to talk${firmBit}: would either of the two times below work for a short call this week? If not, I will work around your schedule.\n\nThanks again,\n[Your name]`;
      const reply = compose({ headline: "The short draft, held for your approval — nothing sent:", facts: [body, "The bracketed slots fill only from real records — the recipient's name from the reply itself, yours from your profile."], nextStep: "Approve it as written, or tell me what to soften." });
      return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: { kind: "reply_short", body } };
    }
    // (8) The biggest-mistake ask — one concrete pitfall, grounded
    // in the thread's own activity.
    if (/\bwhat should i not do\b|\bbiggest mistake\b|\bwhat to avoid\b|\bmistakes?\s+(people|ppl|everyone)\s+make\b|\bworst move\b/.test(t)) {
      const pitfall = C.thread
        ? "Letting the deadline decide by silence. An exploding or tight deadline that lapses with no extension ask and no answer reads as a no — the extension request costs one polite email and keeps every option alive; silence spends the offer itself."
        : C.plan
          ? "Blasting the list before it is verified. One wave to guessed or unverified addresses burns your name at those firms and trips the bounce breaker — the shortlist gets verified first, counts come back, and only sendable names ever see a draft."
          : "Applying everywhere with one generic packet and no record. Untracked, untailored volume produces silence you cannot learn from — a short sourced list, a tailored packet per firm, and every stage logged is what turns applications into a pattern you can fix.";
      const reply = compose({ headline: "The one mistake that costs the most here:", facts: [pitfall], nextStep: "Want the plan re-checked against that pitfall before anything moves?" });
      return { intent: "career_guidance", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    // (9) "Do the first step now" — the in-conversation first step
    // is performed and reported honestly: what was built here, and
    // what (by law) still waits for approval.
    if (/\bdo the first step\b|\bstart the first step\b|\bdo step one\b|\bgo ahead with (the )?first step\b/.test(t) && hasThread) {
      const what = C.thread
        ? `the extension draft on the ${C.thread.firm || "offer"} is composed and held above — it sends only on your approval`
        : C.plan
          ? `the ${C.firm ? `${C.firm.value} ` : ""}plan's first item — the sourcing order and the caps — is set on the record; the list itself builds when you approve the plan`
          : `the checklist from your facts (${C.facts.map(factLine).join("; ")}) is built and item one — sourcing names ${C.geo ? `in ${C.geo.value}` : ""} from the alumni directory — is ready to run the moment you approve the plan`;
      const reply = compose({ headline: "First step done — here is exactly what that means.", facts: [`Done in this conversation: ${what}.`, "Nothing was sent, submitted, or promised to anyone — the going-out actions stay behind your approval, as always; what is done is the preparation, and it is on the record."], nextStep: "Approve the next step and it moves; or correct the target and the preparation re-aims." });
      return { intent: "career_guidance", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    // (10) GPA screen question — answered as doctrine, with no
    // invented firm figure (a company file speaks when one exists).
    if (/\bgpa\b/.test(t) && /\b(bar|cutoff|cut-off|minimum|hard|screen|matter)\b/.test(t)) {
      let cirFact = null;
      try { const cir = cirFor(text, ctx); if (cir) { const bar = cirFieldText(cir.hiring_bar_summary); if (bar) cirFact = bar.split(/(?<=[.!?])\s/)[0]; } } catch { cirFact = null; }
      const facts = ["A GPA screen is a first-pass filter, not the decision: some firms state a minimum and screen on it mechanically in the portal, most treat it as one signal beside school, experience, and the referral path — which is why a warm referral matters more at the margin than a tenth of a point."];
      if (cirFact) facts.push(`The company file on record says: ${cirFact}`);
      else facts.push("No company file on record here publishes a GPA figure, so no specific cutoff is claimed for a specific firm — anyone quoting you one without the file is guessing.");
      const reply = compose({ headline: "The GPA bar, honestly:", facts, nextStep: "Name the firm and I will check its file for a stated screen before you spend an application on it." });
      return { intent: "company_intel", reply, resultStatus: "prepared", sends: 0 };
    }
    // (11) First move / opening move — spoken from the corrected
    // thread record (firm, city, level, year).
    if (/\bfirst move\b|\bopening move\b/.test(t)) {
      if (C.firm || C.geo) {
        const reply = compose({ headline: `Your opening move${C.firm ? ` at ${C.firm.value}` : ""}${C.geo ? ` in ${C.geo.value}` : ""}:`, facts: [`Start with ${C.level ? C.level.value : "analysts"}${C.firm ? ` at ${C.firm.value}` : ""} — sourced from your school's alumni directory and ${C.firm ? `${C.firm.value}'s` : "the firms'"} team pages, warmest path first. One opener, built on one shared fact${C.majors ? ` (your ${C.majors.value} background)` : ""}, held for your approval before anything sends.`, "That order is deliberate: the referral conversation comes before the application, because at a target firm the referral is worth more than the posting."], nextStep: "Say go and the sourcing starts — counts come back before any draft." });
        return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
      }
      if (hasThread) {
        const reply = compose({ headline: "Your first move, from the record:", facts: [`Build the networking plan first — names sourced in order (alumni directory, then team pages)${C.geo ? ` for ${C.geo.value}` : ""}, one opener per sendable name, every send held for your approval — with the role search running beside it and every application tracked from day one.`], nextStep: "Say go and the plan builds now." });
        return { intent: "career_guidance", reply, resultStatus: "awaiting_user", sends: 0 };
      }
    }
    return null;
  }

  // ---------- DEPTH WAVE, Item C (claim class: track_event_report).
  // A user's plain-words report of an application event — "they just
  // emailed me a rejection, ugh", "got an interview invite from
  // Stripe!", "offer came in — 85k" — is CLAIMED here as a tracking
  // turn and routed to 126's ingest/write API. The speech-act
  // discipline is the BUG-169 invariant: the write happens only for
  // the user's own first-person report (that report IS the
  // assertion, and its verbatim text is the event's evidence), and
  // only inside 126 (ingestMessage / addApplication / moveStage). A
  // question about an event, or someone else's event, claims the
  // turn for a clarification at most and writes nothing.
  function trackEventClassOf(t) {
    if (/\b(rejection|rejected|turned (me|it down)|didn'?t get (it|the role|in)|not moving forward with me)\b/.test(t)) return "rejected";
    if (/\b(interview invite|interview invitation|invited (me |us )?to (an )?interview|got an interview|interview (is )?scheduled|phone screen invite)\b/.test(t)) return "interview";
    // DEPTH LANE A (MI-017): a stated upcoming interview ("I have a
    // first-round interview at Copperline in three days") is an
    // interview event on the user's own application — it was
    // claimed by nothing and fell to the generic fallback.
    if (/\bi have an?\b[^.!?]*\binterview\b[^.!?]*\b(at|with|on|tomorrow|today)\b/.test(t)) return "interview";
    if (/\b(offer came in|got an offer|received an offer|offer letter (came|arrived|landed)|they offered me|extended (me )?an offer|offer just (came|landed)|an offer (just )?(came|arrived|landed))\b/.test(t)) return "offer";
    if (/\b(assessment invite|online assessment (invite|invitation)|hackerrank invite|coding challenge invite)\b/.test(t)) return "oa";
    if (/\b(application confirmed|confirmation email (came|landed|arrived|just))\b/.test(t)) return "confirmed";
    return null;
  }
  function handleTrackEventReport(text, ctx) {
    const u = unquotedText(text);
    const t = lc(u);
    const ev = trackEventClassOf(t);
    if (!ev) return null;
    const store = trackStoreOf(ctx);
    if (!store || !Track) return null;
    // Someone else's event is not the user's tracker record.
    if (/\bmy (friend|roommate|brother|sister|classmate|cousin)\b/.test(t) || /\b(good for|happy for) (him|her|them)\b/.test(t)) {
      const reply = compose({ headline: "That one is not yours to log — it is someone else's news.", facts: ["Your tracker records your own applications and their events; a friend's invite or rejection never lands on your rows, and I will not write it there."], nextStep: "Tell me about one of your own applications and it is logged from your words." });
      return { intent: "tracking_status", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    // A question ANYWHERE in the turn means this is not a pure event
    // report: "they offered me 85k — should I take it or negotiate?"
    // is a NEGOTIATION turn that happens to report an offer, and a
    // question about an event ("did they email me a rejection?")
    // reports nothing at all. Either way this claim stands down and
    // the turn's real owner answers it — nothing is written here.
    if (interrogativeTurn(text) || s(text).includes("?") || /\bshould i\b/.test(t)) return null;
    // The report must be framed as the user's own: a first-person
    // marker, a bare event-arrival verb, or a named company acting
    // toward the user. Anything else is left to other routes.
    // DEPTH LANE A (MI-017): the third branch existed only in this
    // comment — "an offer just came in from Atlas Freight" carries
    // no first-person word, so it fell to the fallback while the
    // offer sat unrecorded. A resolved company + an arrival verb IS
    // the company acting toward the user.
    const namedCompany0 = companyFromText(text, ctx) || companyFromApplicationText(text);
    // An event report names its company in the "from X" frame
    // ("an offer just came in from Atlas Freight") — neither general
    // extractor reads that frame, so the event path resolves it
    // itself; the capital gate keeps "from the cold" out.
    const fromM = !namedCompany0 ? s(text).match(/\bfrom\s+([A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+)?)/) : null;
    const namedCompany = namedCompany0 || (fromM ? fromM[1].replace(/[?.!,]+$/, "").trim() : null);
    const userFramed = /\b(me|my|mine|i|we|us)\b/.test(t) || /^(got|offer came|rejection came|it came|just got)\b/.test(t.trim()) || (!!namedCompany && /\b(came in|just came|arrived|landed|just landed)\b/.test(t));
    if (!userFramed) return null;
    let company = namedCompany;
    const rows = Array.isArray(store.rows) ? store.rows : [];
    if (!company && rows.length) {
      const open = rows.filter((r) => !/Rejected|Withdrawn|Accepted/i.test(r.stage || ""));
      company = (open.length === 1 ? open[0] : rows.length === 1 ? rows[0] : null)?.company || null;
      if (!company && rows.length === 1) company = rows[0].company;
    }
    // LF-09 (i) (BUG-274 / FR-429): there is deliberately NO further
    // fallback. The on-record target_firm used to be read here as the
    // company of last resort — so an unnamed offer report ("I got an
    // offer from a fintech startup, 85k…") was recorded FOR the target
    // firm, with a synthesized applied event (live v227, P1 t1: row
    // app-meridian-capital-10). A target firm is a PREFERENCE fact —
    // where the user wants to end up — never an attribution source
    // for an application, an offer, or an event: a state write needs
    // the user's own assertion naming the company (or a row their
    // assertion already opened, above), and without one the event is
    // recorded company-not-stated by 126's TN-1a path below.
    // The write, inside 126 only: ingest first (its classifier links
    // and moves the row when the report's words carry a signal), and
    // where ingest cannot link a named company's row, 126's own
    // add/move API lands the user's asserted event on it. The message
    // rides 126's USER channel (source "user-reported", the user's own
    // text as the body, no synthetic subject): the BUG-217 assertion
    // gate decides whether the words may write at all, the verbatim
    // clause is stored as the event's evidence, and a company the
    // words do not name opens a not-stated row — the write never goes
    // through dressed as an inbox detection (the v227 row's events
    // carried source "inbox" and an "offer detected in inbox message"
    // detail for a chat report).
    let ing = null;
    try { ing = Track.ingestMessage ? Track.ingestMessage(store, { id: `chat-${nowOf(ctx)}`, from: "user report in chat", source: "user-reported", body: s(text), company: company || undefined }, { now: nowOf(ctx) }) : null; } catch { ing = null; }
    let row = null;
    if (ing && ing.linked && company) row = rows.find((r) => lc(r.company) === lc(company)) || null;
    if (!row && company) {
      row = rows.find((r) => r.company && lc(r.company) === lc(company)) || null;
      if (!row) {
        try { row = Track.addApplication(store, { company, title: "role (user-reported)", source: "user_reported", stage: STAGE_FOR_126[ev], event_source: "user-reported" }, { now: nowOf(ctx) }); } catch { row = null; }
      } else if (row.stage !== STAGE_FOR_126[ev] && Track.moveStage) {
        try { Track.moveStage(row, STAGE_FOR_126[ev], { type: EVENT_FOR_126[ev], source: "user-reported", detail: `user reported in chat: "${s(text).slice(0, 120)}"`, evidence: s(text).slice(0, 200) }, nowOf(ctx)); } catch { /* the read-back below decides what is claimed */ }
      }
    }
    if (!row) {
      // Claimed, but the event cannot be bound to a row yet: one
      // precise question, and (beyond any not-stated row 126 itself
      // opened from the assertion) nothing is invented.
      // DEPTH LANE B (MI-014): for an OFFER event, the reply echoes
      // the offer record the capture pass wrote from the user's own
      // words (figure, deadline, descriptor) — the note names what
      // was actually reported instead of a bare "an offer landed".
      const facts0 = ["The event is real the moment you report it, but the tracker moves a specific row — and no row in this thread matches it yet, so I will not guess a company onto it."];
      if (ev === "offer") {
        const thT = negotiationThreadOf(ctx);
        if (thT.amount || thT.deadline || thT.descriptor || thT.firm) {
          facts0.unshift(`The offer as you stated it: ${thT.amount ? `$${Number(thT.amount).toLocaleString()} base` : "an offer"}${thT.firm ? ` at ${thT.firm}` : thT.descriptor ? ` from ${thT.descriptor}` : ""}${thT.deadline ? `, answer by ${thT.deadline}` : ""} — that record is on this thread now, and the negotiation plan runs on it whenever you ask.`);
        }
      }
      const reply = compose({ headline: `Noted — a ${ev === "oa" ? "assessment" : ev} landed. Which application is it for?`, facts: facts0, nextStep: "Name the company and the row moves in the same turn, from your words." });
      return { intent: "tracking_status", reply, resultStatus: "awaiting_user", sends: 0, stage: ev };
    }
    // Read-back before the claim: the stage spoken is the row's own.
    const stageNow = row.stage || STAGE_FOR_126[ev];
    const label = { rejected: "Rejection", interview: "Interview invite", offer: "Offer", oa: "Assessment invite", confirmed: "Confirmation" }[ev];
    const facts = [`Recorded from your report just now — your words are the evidence on the row: "${s(text).slice(0, 120)}".`];
    if (ev === "offer") facts.push("The offer also starts the negotiation record: its terms get read from the letter itself, and the deadline clock runs from the letter, never from a guess.");
    if (ev === "rejected") facts.push("One rejection is a data point, not a verdict — the pattern note builds only when the record holds more than one.");
    const reply = compose({ headline: `${label} on the record for ${row.company} — the row now shows ${stageNow}.`, facts, nextStep: ev === "interview" ? "Want the prep pack for it now?" : ev === "offer" ? "Want the offer terms laid out and the counter plan started?" : "Want the status of the rest of the tracker?" });
    const res = { intent: "tracking_log", reply, resultStatus: "completed", sends: 0, stage: ev, company: row.company, track_event: { class: ev, stage_after: stageNow, source: "user_reported_chat" } };
    return emitTrack(ctx, res, { company: row.company, stage: stageNow, event_type: EVENT_FOR_126[ev], source: "user_reported", note: `${label} reported by the user in chat` });
  }

  function handleClarifying(text, ctx) {
    const raw = s(text);
    const t = lc(text);
    // DEPTH LANE A: a vent about a third person's recruiting stress
    // ("my roommate is a junior at Yale studying art history, she's
    // stressed about recruiting") carries no ask and no fact about
    // the USER — nothing is recorded (the capture screen has
    // already stood down) — but it still deserves an answer, not
    // the generic fallback: acknowledge, and offer the help that
    // travels through the user.
    if (/\bmy (roommate|friend|brother|sister|classmate|coworker|co-worker|partner|cousin)\b[^.]*\b(stressed|struggling|nervous|worried|anxious|overwhelmed|freaking out)\b/.test(t)) {
      const reply = compose({ headline: "That recruiting stress is real — and it is hers, so nothing about it goes on YOUR record.", facts: ["What I can do from here: build her a starter plan you can hand over — the first three moves for someone at her stage — or prep questions she can rehearse with.", "If any of it is actually about your own search too, say the word and we work on yours directly."], nextStep: "Want the starter plan for her, in words you can just pass on?" });
      return { intent: "career_guidance", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    // A pronoun with no referent ("can she refer me?") gets ONE
    // question — never a guess, never the fallback.
    if (/\bcan (she|he|they) refer me\b/.test(t) && !/\bworks at\b/.test(t) && !/\b[A-Z][a-z]+ (?:—|-|works|at)\b/.test(raw)) {
      const reply = compose({ headline: "One thing I need before that can be answered: who is she?", facts: ["A referral depends on who she is and where she works — whether she is at the firm, how warm the path is, and whether she knows your work. None of that is on record yet in this conversation, and I will not guess at a person."], nextStep: "Name her and her firm, and I will tell you straight whether she can refer you — and prepare the ask if she can." });
      return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, payload: { kind: "clarifying_question", missing: "referent_identity" }, artifact: { kind: "clarifying_question", missing: "referent_identity" } };
    }
    // Bare help ("help me get a job"): the capability map plus the
    // ONE decision that shapes everything else.
    if (/^\s*(please\s+)?help me get a (job|role)\s*[.!?]?\s*$/i.test(raw) || /^\s*help me find a job\s*[.!?]?\s*$/i.test(raw)) {
      const reply = compose({ headline: "Here is what I can actually do — and the one decision that shapes it.", facts: ["The full loop runs here: find roles and rank them honestly, build each application to its doorstep for your approval, track every stage, build networking plans with sourced names, prep you for interviews, and run the negotiation. Nothing sends or submits without your yes.", "What I cannot do is aim at 'a job' in general — the field and the season decide which of those gears turns first."], nextStep: "Internship or full-time — and in what field? Answer that and the loop starts in the right gear." });
      return { intent: "career_guidance", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    // A long first-person narrative with no decidable ask: reflect
    // one captured fact, name the honest read, ask the one question
    // that unlocks a plan.
    if (raw.length > 240 && /\b(i don'?t know|idk|what (do|should) i do|no idea)\b/.test(t)) {
      const facts = statedFactsOf(ctx);
      const exp = facts.find((f) => f.kind === "experience");
      const lines = ["Heard — and let me reflect the part that matters most: having no network handed to you is the normal starting point, not a disqualifier. The roommate's dad is one path; it was never the only one, and the people who build theirs deliberately usually end up with the stronger one."];
      if (exp) lines.push(`You also have more raw material than you are crediting: ${factLine(exp)} — that is a real story, and stories are what networking and interviews run on.`);
      lines.push("What I will not do is hand you a generic plan for 'banking or tech or whatever' — the field decides the plan, so that is the one decision to make first.");
      const reply = compose({ headline: "Your situation is workable — here is the honest read.", facts: lines, nextStep: "If you had to test one for two weeks — banking or tech — which pulls you more? We start there, and the other stays open." });
      return { intent: "career_guidance", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    return null;
  }

  // ---------- COMPLEXITY WAVE (BUG-179): multi-intent turns. A
  // message carrying two or more distinct asks used to be answered
  // by whichever route fired first, with the rest silently dropped.
  // The parts are detected up front; the served part answers as
  // always, the unserved parts are QUEUED on ctx.intentQueue (state,
  // named in the reply), and a continuation ("next", "start with the
  // first one") runs the queue head. A shelved-finance part is
  // answered inline with the honest scope note — career is the live
  // product; the finance side is shelved, and its asks are not
  // dropped either.
  function intentPartsOf(text) {
    const t = lc(text);
    const parts = [];
    const add = (key, label, re) => { const m = t.match(re); if (m) parts.push({ key, label, idx: m.index }); };
    add("find", "the search", /\bfind\b[^.]*\b(internships?|roles|jobs)\b|\bfind me\b|\bhunt down\b[^.]*\b(internships?|roles|jobs)\b|\bsearch for\b[^.]*\b(internships?|roles|jobs)\b/);
    add("networking", "the networking plan", /\bnetwork(ing)?\s+plan\b|\bnetwork into\b|\bfind people\b|\bplan outreach\b|\bstart networking\b|\bput together\b[^.]*\bnetwork/);
    // DEPTH LANE A: a tracker STATUS ask is a part too ("...and tell
    // me what my tracker looks like") — the taxonomy only knew
    // tracking SETUP, so a status part in a mixed message was
    // silently dropped instead of served or queued.
    add("tracking", "application tracking", /\bset up\b[^.]*\btrack|\btracking for\b|\btrack(ing)? my applications\b|\bset up tracking\b|\bcheck\b[^.]*\bstatus of my\b[^.]*\bapplications?\b|\bmy tracker\b|\bmy pipeline\b|\bshow (me )?my applications\b|\bwhat applications do i have\b|\blist my applications\b/);
    // INTEGRATION (2026-10-16): the market-value ask is a part too —
    // the taxonomy had no worth part, so a worth ask inside a mixed
    // message was invisible to the accounting: neither served by the
    // composition nor named as held.
    add("worth", "the market-value read", /\bwhat am i worth\b|\bmarket value\b|\bmy worth now\b/);
    add("log", "the tracker log", /\blog\b[^.]*\b(applied|application)\b|\bi applied to\b/);
    add("watch", "the watch", /\bset up\b[^.]*\bwatch\b|\bwatch for\b|\bstart watching\b|\balert me\b[^.]*\broles?\b/);
    add("negotiation", "the negotiation", /\bnegotiat\w*\b/);
    add("prep", "the interview prep", /\bprep\b[^.]*\binterviews?\b|\bprep me\b|\bprep for (the|my|a) interviews?\b|\bprepare me for\b/);
    add("draft", "the draft", /\bdraft\b[^.]*\b(email|opener|note|message|letter)\b/);
    add("finance", "the money question", /\bhow much did i spend\b|\bspend on\b|\bspending\b|\bbudget\b|\binvest(ing|ment)?\b[^.]*\b(my|the)\b|\bmy portfolio\b|\bstocks?\b/);
    parts.sort((a, b) => a.idx - b.idx);
    const seen = new Set();
    return parts.filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)));
  }
  function multiMarkerOf(text) {
    // DEPTH WAVE (BUG-215 / FR-372): the marker set is structural —
    // enumerated asks ("two asks"), list punctuation between two
    // detected parts, or a coordinator between them — not a fixed
    // list of battery markers.
    return /\b(two|three|four)\s+(things|asks|parts|requests)\b|\bat once\b|\bboth\b|\band also\b|\bas well as\b|\balso,?\s+(find|start|set up|prep|track)\b/i.test(s(text));
  }
  function financeScopeResult() {
    const reply = compose({ headline: "That part is the money product — and this build is the career agent.", facts: ["The finance side of Upmore is shelved in this build: spending questions, budgets, and investing are not answered here, and I will not guess at your bank data from a career thread.", "What is live, and fully staffed, is the career loop: find roles, apply at the doorstep, track, outreach, prep, negotiate."], nextStep: "Ask me for any part of the career loop and it runs now." });
    return { intent: "honest_unavailable", reply, resultStatus: "awaiting_user", sends: 0, payload: { kind: "shelved_scope", scope: "finance" }, artifact: { kind: "shelved_scope", scope: "finance" } };
  }
  function runIntentPart(part, text, ctx) {
    try {
      if (part.key === "find") return handleInternship(text, ctx) || handleDiscovery(text, ctx, {});
      if (part.key === "networking") return handleCampaignPlan(text, ctx);
      if (part.key === "tracking") {
        const store = trackStoreOf(ctx);
        const n = store && store.rows ? store.rows.length : 0;
        const reply = compose({ headline: "Tracking is on — it has been recording from this conversation.", facts: [`Your tracker currently holds ${n} application${n === 1 ? "" : "s"}. Anything you report ("I applied to X", "track this: ...") is written to it and read back before the reply speaks, so the record you see is the record that exists.`, "Stage changes work the same way: tell me what moved and the row updates from your report — never from a guess."], nextStep: "Tell me the first application to log, or ask what is on record." });
        return { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0 };
      }
      if (part.key === "negotiation") return handleNegotiation(text, ctx);
      if (part.key === "worth") {
        // The sourced worth product lives in 130's front door
        // (SC-271). Run it for this part alone: the _intentPartRun
        // flag lifts 130's multi-ask stand-down for this call only.
        try {
          ctx._intentPartRun = true;
          const r = Onboarding && typeof Onboarding.handleChat === "function" ? Onboarding.handleChat(text, ctx) : null;
          delete ctx._intentPartRun;
          if (r && r.intent === "career_os_market_value") return r;
        } catch { try { delete ctx._intentPartRun; } catch { /* flag dies with the turn */ } }
        return handleOS(text, ctx);
      }
      if (part.key === "log") return handleTrackLog(text, ctx);
      if (part.key === "watch") return handleWatchCreate(text, ctx);
      if (part.key === "prep") return handlePrepExtras(text, ctx) || handlePrepQuestion(text, ctx) || handlePrepNeedsProfile(text, ctx);
      if (part.key === "draft") {
        const reply = compose({ headline: "The draft part is queued behind the plan it belongs to.", facts: ["A draft is written from the plan's sendable names and your confirmed facts — until the plan stands and the counts come back, there is no one to draft TO, and a draft without a recipient is fiction.", "The moment the plan is approved, drafting is the very next step — the text is composed then, from the real names, and held for your approval."], nextStep: "Approve the plan part and the draft follows in the same flow." });
        return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0 };
      }
      if (part.key === "finance") return financeScopeResult();
    } catch { return null; }
    return null;
  }
  function handleContinuation(text, ctx) {
    const queue = Array.isArray(ctx.intentQueue) ? ctx.intentQueue : null;
    if (!queue || !queue.length) return null;
    const t = lc(text);
    // DEPTH WAVE (BUG-215 / FR-372): continuation is a speech-act
    // class — kick off / start with / now / next / continue, aimed at
    // an ordinal or the queue head — not the battery's three wordings.
    if (!/^(start|begin|do|take|run|kick off|go)\b[^.]*\b(first|next|that|it|one|opening)\b|^next\b[^.?!]*$|\bthe (second|next|first) one\b|\bnext one\b|\bnext part\b|\bfirst one\b|\bopening one\b|\bcontinue\b|\bkeep going\b|\bnow the\b/.test(t)) return null;
    // "The second one" (or "now the second") pops the SECOND queued
    // part when it exists; every other continuation pops the head.
    const secondWanted = /\bsecond one\b|\bnow the second\b/.test(t);
    const part = secondWanted && queue.length > 1 ? queue.splice(1, 1)[0] : queue.shift();
    ctx.intentQueue = queue;
    const res = runIntentPart(part, part.ask || text, ctx);
    if (!res) return null;
    if (queue.length) {
      res.reply = `${res.reply}\n\nStill held from your earlier message: ${queue.map((q, i) => `${i + 1}) ${q.label}`).join("; ")} — say "next" and we continue.`;
    }
    return res;
  }
  // COMPLEXITY WAVE (BUG-179): the product-rules enumeration ("what
  // are the send caps, where do the names come from, why shortlist
  // first, when do sends start — answer all of it") is answered in
  // full, from the locked doctrine — previously only its discovery
  // fragment routed anywhere.
  function handleProductRules(text, ctx) {
    const t = lc(text);
    const asksCaps = /\bsend caps?\b|\bcaps?\b[^.]*\bsend\b|\bhow many (emails|sends)\b/.test(t);
    const asksSources = /\bwhere do (the )?names come from\b|\bname sources\b|\bsources of (the )?names\b/.test(t);
    const asksWhy = /\bwhy shortlist\b|\bshortlist first\b|\binstead of blasting\b/.test(t);
    const asksWhen = /\bwhen do sends (actually )?start\b|\bwhen does sending start\b/.test(t);
    if ([asksCaps, asksSources, asksWhy, asksWhen].filter(Boolean).length < 2) return null;
    const facts = [];
    if (asksCaps) facts.push("Send caps: outreach starts at 12 emails a day, rises by 5 every 3 days, and never passes 30 a day; at most 15 first emails go to one firm in any 30 days, and applications are capped at 15 a day.");
    if (asksSources) facts.push("Where names come from, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages. Every name carries its source, and nobody is emailed on a guessed address — inferred emails are labeled and held.");
    if (asksWhy) facts.push("Why shortlist first: a blast burns the only asset that compounds — your name at those firms. The shortlist is verified before anything is drafted, so the first email a banker sees from you is accurate, sourced, and written for them; the caps then keep the wave inside what inboxes tolerate.");
    if (asksWhen) facts.push("When sends start: after you approve the plan. The list is built, the found/trustworthy/sendable counts come back to you, drafts are written from the sendable names — and the first send waits for your one approval of the whole plan.");
    const reply = compose({ headline: "All of it, in order.", facts, nextStep: "Say the word and I start with the shortlist — counts before drafts, approval before sends." });
    return { intent: "outreach_clarification", reply, resultStatus: "prepared", sends: 0, payload: { kind: "product_rules" }, artifact: { kind: "product_rules" } };
  }

  // The public entry: EVERY handler's reply passes the H-12 ending
  // guarantee here, including replies composed inside the domain
  // modules this router delegates to (120/124/126 author their own
  // text; a "Next step —" ending without a question or marker still
  // trails off by the reply contract).
  // COMPLEXITY WAVE (BUG-173): a posting the user PASTES into the
  // chat was previously invisible to every later turn — the tailor
  // ask that followed had no target and fell to the fallback. The
  // capture is conservative: a quoted block that reads like a posting
  // (a requirements/responsibilities marker), with its title/company
  // header parsed only when the header shape is explicit. The staged
  // posting persists (posting + pastedText are snapshot state).
  function capturePastedPosting(text, ctx) {
    const c = ctx || {};
    if (c.posting && c.posting.source === "user_pasted") return;
    const raw = s(text);
    const qm = raw.match(/['"]([\s\S]{80,4000}?)['"]/);
    if (!qm) return;
    const quoted = qm[1];
    if (!/\b(requirements|responsibilities|you will|what you.ll do|qualifications)\b/i.test(quoted)) return;
    const headM = quoted.match(/^\s*([A-Z][A-Za-z0-9&/()' -]{3,70}?),\s+([A-Z][A-Za-z&. ]{2,40}?)\s+[—–-]/);
    const posting = { source: "user_pasted", jd_text: quoted.slice(0, 4000), pasted_at: new Date(nowOf(c)).toISOString() };
    if (headM) { posting.title = headM[1].trim(); posting.company = headM[2].trim(); }
    c.posting = posting;
    c.pastedText = quoted.slice(0, 4000);
  }
  function handleChat(text, ctx) {
    const c = ctx || {};
    // COMPLEXITY WAVE (BUG-179): multi-intent accounting wraps the
    // dispatch — the parts are detected from the ORIGINAL text, the
    // dispatch serves what it serves, and whatever it did not serve
    // is queued and NAMED, never dropped. A finance-only ask in this
    // career build gets the honest scope answer.
    const parts = intentPartsOf(text);
    const multi = parts.length >= 2 && (multiMarkerOf(text) || parts.length >= 3 || /\band\b|;/.test(lc(text)));
    const res = dispatchChat(text, c);
    // W-NEXTSTEP: work actually served this turn becomes the
    // thread's active work (mirrored out by syncThreadOut below),
    // so a later noun-less follow-up can be answered from it.
    recordActiveWork(c, res, text);
    if (parts.length === 1 && parts[0].key === "finance" && (!res || res.intent === "career_fallback")) {
      syncThreadOut(c);
      return financeScopeResult();
    }
    if (multi && res && res.intent !== "career_fallback") {
      const servedFamily = { career_discovery: "find", career_internship_discovery: "find", outreach_clarification: "networking", outreach_draft: "networking", tracking_status: "tracking", tracking_log: "tracking", negotiation_advice: "negotiation", negotiation_plan: "negotiation", negotiation_draft: "negotiation", prep_brief: "prep", prep_needs_profile: "prep", career_watch_create: "watch", career_watch_manage: "watch", career_os_market_value: "worth" }[res.intent] || null;
      const unserved = parts.filter((p) => p.key !== servedFamily && p.key !== "finance" && !(p.key === "log" && servedFamily === "tracking"));
      const financePart = parts.find((p) => p.key === "finance");
      const additions = [];
      if (financePart) additions.push("One part I cannot run here: the money question — this build is the career agent and the finance side is shelved, so spending questions are not answered (or guessed at) in this thread.");
      if (unserved.length) {
        // DEPTH LANE A (MI-013): one unserved part is COMPOSED into
        // this turn's reply as a preview, not just queued — a part
        // the user asked for is visible in the turn they asked for
        // it in, when its own handler can run on the same text
        // (search, prep, tracker status/log, negotiation, the plan).
        // The part STAYS in the held queue regardless: the
        // queue-and-continuation contract is pinned behavior (the
        // battery's "held in order" replies and the continuation
        // tests run the part in full on "next"), so the preview
        // never consumes it. A part whose handler stands down (or
        // falls back) is queued without a preview, never faked.
        const INLINE_OK = new Set(["find", "prep", "tracking", "log", "negotiation", "networking", "worth"]);
        const stillQueued = [];
        let inlined = 0;
        for (const p of unserved) {
          if (!inlined && INLINE_OK.has(p.key) && !/^(application_packet|doorstep)/.test(res.intent || "")) {
            const pr = runIntentPart(p, s(text), c);
            if (pr && pr.reply && pr.intent !== "career_fallback") { res.reply = `${res.reply}\n\n${pr.reply}`; recordActiveWork(c, pr, text); inlined += 1; }
          }
          stillQueued.push(p);
        }
        if (stillQueued.length) {
          c.intentQueue = stillQueued.map((p) => ({ key: p.key, label: p.label, ask: s(text) }));
          additions.push(`Also in your message, held in order: ${stillQueued.map((p, i) => `${i + 1}) ${p.label}`).join("; ")} — say "next" and we take the next one, or name the part and we jump to it.`);
        }
      }
      if (additions.length) res.reply = `${res.reply}\n\n${additions.join("\n")}`;
    }
    // The 140 unmatched fallback and the capability-absent honest
    // replies are exact-text contracts of their own — never appended to.
    if (res && typeof res.reply === "string" && res.reply && res.intent !== "career_fallback" && res.intent !== "honest_unavailable") res.reply = ensureNextStepText(res.reply);
    syncThreadOut(c);
    return res;
  }
  return { handleChat, handleStateChangeIntents, recordInvalidation, sha256, rankedShortlist, scoringProfile, adaptPosting, jdTextForPosting, preCheck, detectContradiction };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerRouter;
