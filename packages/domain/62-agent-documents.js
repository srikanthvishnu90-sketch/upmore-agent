  /* Documents and security (Instinct spec doc 02: INS-001/003/008/009/010, TAX-002/003/005/010/012, TXN-010/015/016, SEC-008/011):
     the vault index (metadata only, never the bytes), policies and tax forms as
     typed documents with expiry and renewal, receipt emails parsed and matched to
     transactions, photo receipts attached by what the user says they are, the
     unrecognized-charge triage ladder, phishing detection on finance emails, the
     agent's own session and device audit, estimated-tax and filing calendars, the
     donation log and refund tracking. Pure. Nothing here reads a mailbox or a
     camera; it takes what a connector hands it and says what it found. */
  const AgentDocuments = (() => {
    const DAY = 86400000;
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const ymd = s => String(s || "").slice(0, 10);
    const dayMs = s => Date.parse(ymd(s) + "T00:00:00Z");
    const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);
    const addDays = (s, n) => new Date(dayMs(s) + n * DAY).toISOString().slice(0, 10);
    const cents = t => Number.isInteger(t.amount_cents) ? t.amount_cents : Math.round(Number(t.amount || 0) * 100);
    const SECRET = /\b\d{3}[- ]\d{2}[- ]\d{4}\b|\b(?:\d[ -]?){13,19}\b|\b\d{9,17}\b/;
    // The metadata fields kept and shown (title, issuer, tags...): an SSN, a run of 9-19 digits, or a card number in
    // groups of four (or Amex 4-6-5). An order number like 112-1234567-1234567 is not an account number and is kept.
    const META_SECRET = /\b\d{3}[- ]\d{2}[- ]\d{4}\b|\b\d{9,19}\b|\b\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}\b|\b\d{4}([ -])\d{6}\2\d{5}\b/;
    const META_FIELDS = ["title", "issuer", "subkind", "coverage", "tags", "beneficiaries"];
    const dayCount = n => `${n} day${n === 1 ? "" : "s"}`;

    // Vault index: typed metadata, a content hash the caller computed, where the bytes live. INS-010 policies, TAX-002 tax forms, receipts.
    const KINDS = { policy: ["health", "auto", "home", "renters", "life", "umbrella", "disability", "pet"], tax_form: ["W-2", "1099-NEC", "1099-INT", "1099-DIV", "1099-B", "1099-K", "1099-R", "1098", "1098-T", "1095-A", "K-1", "W-9"], receipt: [], statement: [], id_document: [], other: [] };
    function vault(initial) {
      const docs = (initial || []).slice();
      const add = (d, now) => { const need = ["kind", "title", "location"].filter(k => !d[k]); if (need.length) throw new Error(`A document needs ${need.join(", ")}.`); if ((d.text && SECRET.test(d.text)) || META_FIELDS.some(k => [].concat(d[k] == null ? [] : d[k]).some(x => typeof x === "string" && META_SECRET.test(x)))) throw new Error("The vault stores metadata, never text with an identity or account number in it."); const r = { id: d.id || `doc-${docs.length + 1}`, kind: d.kind, subkind: d.subkind || null, title: d.title, location: d.location, sha256: d.sha256 || null, year: d.year || null, issuer: d.issuer || null, effective_on: d.effective_on || null, expires_on: d.expires_on || null, renews_on: d.renews_on || null, premium_cents: d.premium_cents != null ? d.premium_cents : null, coverage: d.coverage || null, deductible_cents: d.deductible_cents != null ? d.deductible_cents : null, beneficiaries: d.beneficiaries || null, beneficiaries_reviewed_on: d.beneficiaries_reviewed_on || null, amount_cents: d.amount_cents != null ? d.amount_cents : null, transaction_id: d.transaction_id || null, added_at: now, tags: d.tags || [] }; docs.push(r); return r; };
      const list = f => docs.filter(d => !f || Object.entries(f).every(([k, v]) => d[k] === v));
      const find = q => { const s = String(q || "").toLowerCase(); return docs.filter(d => [d.title, d.kind, d.subkind, d.issuer, d.year && String(d.year)].concat(d.tags).filter(Boolean).some(x => String(x).toLowerCase().includes(s))); };
      const remove = id => { const i = docs.findIndex(d => d.id === id); return i >= 0 ? docs.splice(i, 1)[0] : null; };
      return { add, list, find, remove, docs };
    }
    // INS-001 / INS-003 / INS-008: the policy inventory, renewals coming up with the rebid reminder, the beneficiary audit.
    function policies(v, today) {
      const rows = v.list({ kind: "policy" }).map(p => ({ id: p.id, line: p.subkind, issuer: p.issuer, title: p.title, premium_cents: p.premium_cents, deductible_cents: p.deductible_cents, coverage: p.coverage, renews_on: p.renews_on, days_to_renewal: p.renews_on ? daysBetween(today, p.renews_on) : null, expires_on: p.expires_on, lapsed: p.expires_on ? dayMs(p.expires_on) < dayMs(today) : false }));
      const missing = ["health", "auto", "home"].filter(l => !rows.some(r => r.line === l || (l === "home" && r.line === "renters")));
      // A lapsed policy is said to be lapsed, and its premium is not a cost the person is paying.
      return { policies: rows, annual_premiums_cents: rows.reduce((s, r) => s + (r.lapsed ? 0 : r.premium_cents || 0), 0), lines_without_a_policy_on_file: missing, text: rows.length ? `${rows.length} polic${rows.length === 1 ? "y" : "ies"} on file: ${rows.map(r => `${r.line} (${r.issuer || "issuer unknown"}${r.lapsed ? `, lapsed ${r.expires_on}` : `${r.premium_cents != null ? `, ${money(r.premium_cents)} a year` : ""}${r.renews_on ? `, renews ${r.renews_on}` : ""}`})`).join("; ")}.${missing.length ? ` Nothing on file for ${missing.join(", ")}; that is a gap in my records, not necessarily in your cover.` : ""}` : "No policies on file.", source: "your vault", as_of: today };
    }
    function renewals(v, today, days) { const h = days || 45; return policies(v, today).policies.filter(p => p.days_to_renewal != null && p.days_to_renewal >= 0 && p.days_to_renewal <= h).map(p => ({ id: p.id, line: p.line, issuer: p.issuer, renews_on: p.renews_on, days: p.days_to_renewal, premium_cents: p.premium_cents, text: `${p.line} with ${p.issuer || "your insurer"} renews ${p.renews_on} (${p.days_to_renewal === 0 ? "today" : dayCount(p.days_to_renewal)})${p.premium_cents != null ? ` at ${money(p.premium_cents)}` : ""}. Two or three quotes now, before the renewal lands, is when switching costs nothing; I can list what to ask for.`, deadline: dayMs(p.renews_on), capability_id: "INS-003" })); }
    function beneficiaryAudit(v, today, lifeEvents) {
      const rows = v.list({ kind: "policy" }).filter(p => ["life", "disability"].includes(p.subkind)).concat(v.list({ kind: "statement" }).filter(p => /retirement|401k|ira/i.test(p.subkind || p.title || "")));
      const out = rows.map(p => { const age = p.beneficiaries_reviewed_on ? daysBetween(p.beneficiaries_reviewed_on, today) : null, event = (lifeEvents || []).find(e => !p.beneficiaries_reviewed_on || dayMs(e.on) > dayMs(p.beneficiaries_reviewed_on)); return { id: p.id, title: p.title, beneficiaries: p.beneficiaries, reviewed_on: p.beneficiaries_reviewed_on, due: !p.beneficiaries || age == null || age > 365 || !!event, reason: !p.beneficiaries ? "no beneficiary on file" : event ? `${event.kind} on ${event.on} since the last review` : age == null ? "never reviewed" : age > 365 ? `last reviewed ${Math.floor(age / 365)} year(s) ago` : null }; });
      return { items: out, due: out.filter(x => x.due), text: out.filter(x => x.due).length ? `Beneficiaries worth checking: ${out.filter(x => x.due).map(x => `${x.title} (${x.reason})`).join("; ")}. A beneficiary form beats a will; it takes minutes with the issuer.` : "Beneficiaries were reviewed within the year and nothing changed.", capability_id: "INS-008" };
    }
    // INS-009: open enrollment windows the user told me about, plus the two public ones with their usual dates, as a reminder with lead time.
    const PUBLIC_WINDOWS = [{ id: "aca_marketplace", name: "Healthcare.gov marketplace open enrollment", opens: "11-01", closes: "01-15", note: "most states; some state marketplaces differ" }, { id: "medicare", name: "Medicare open enrollment", opens: "10-15", closes: "12-07", note: "annual" }];
    function enrollmentWindows(user, today) {
      // The window that has not closed yet: last year's while it crosses New Year (the marketplace in early January), else this year's, else next year's.
      const y = Number(today.slice(0, 4)), occ = (w, yy) => ({ open: `${yy}-${w.opens}`, close: w.closes < w.opens ? `${yy + 1}-${w.closes}` : `${yy}-${w.closes}` });
      const rows = PUBLIC_WINDOWS.filter(w => !user || !user.exclude || !user.exclude.includes(w.id)).map(w => { let o = occ(w, y - 1); if (dayMs(today) > dayMs(o.close)) o = occ(w, y); if (dayMs(today) > dayMs(o.close)) o = occ(w, y + 1); return { id: w.id, name: w.name, opens: o.open, closes: o.close, note: w.note }; }).concat(((user || {}).windows || []).map(w => ({ id: w.id || w.name, name: w.name, opens: w.opens, closes: w.closes, note: w.note || "from you" })));
      const live = rows.map(w => ({ ...w, state: dayMs(today) < dayMs(w.opens) ? `opens in ${dayCount(daysBetween(today, w.opens))}` : dayMs(today) < dayMs(w.closes) ? `open, ${dayCount(daysBetween(today, w.closes))} left` : dayMs(today) === dayMs(w.closes) ? "open, last day today" : "closed" }));
      return { windows: live, text: live.map(w => `${w.name}: ${w.state} (${w.opens} to ${w.closes}${w.note ? `; ${w.note}` : ""})`).join(". ") + ".", capability_id: "INS-009", caveat: "Dates are the usual ones; the official page for the year decides." };
    }

    // TXN-015: receipt emails parsed (merchant, total, date, order number) and matched to a transaction by amount and date; no match is reported as such.
    const TOTAL_RE = /\b(?:order total|total charged|total|amount charged|grand total|you paid|charged)\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i;
    // An order number has a digit ("Order Confirmation" is not order "Confirmation"), or is an all-capital code after an
    // explicit marker ("Confirmation: XKJQPL", "Confirmation #ABCDEF"). After a miss the search resumes one character on.
    const ORDER_RE = /(?:order|confirmation|receipt|invoice)\s*(number|no\.?|#|id)?\s*([:\-])?\s*([A-Z0-9][A-Z0-9-]{4,})/gi;
    const orderOf = text => { const re = new RegExp(ORDER_RE.source, "gi"); let m; while ((m = re.exec(text))) { const code = m[3]; if (/\d/.test(code) || ((m[1] || m[2]) && code === code.toUpperCase())) return code; re.lastIndex = m.index + 1; } return null; };
    // A shared mailbox (no-reply@, receipts@, orders@) names nobody; the company is the domain (receipts@email.uber.com is uber).
    const GENERIC_BOX = /^(?:no-?reply|do-?not-?reply|donotreply|receipts?|orders?|order-?update|auto-?confirm|confirm(?:ation)?s?|notifications?|notify|info|billing|support|help|e?mail|hello|service|accounts?|payments?|store|shop|team|news|updates?|alerts?)$/i;
    const domainLabel = d => { const parts = String(d || "").toLowerCase().split(".").slice(0, -1); if (parts.length > 1 && ["co", "com", "org", "net"].includes(parts[parts.length - 1])) parts.pop(); return parts.pop() || null; };
    const DATE_RE = /\b(20\d{2}-\d{2}-\d{2})\b|\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}, 20\d{2})\b/;
    function parseReceipt(email) {
      const text = `${email.subject || ""}\n${email.body || ""}`, t = text.match(TOTAL_RE), order = orderOf(text), d = text.match(DATE_RE);
      const addr = (email.from || "").match(/^\s*([^<@\s]+)@([^>\s]+)\s*$/), box = addr && GENERIC_BOX.test(addr[1]) ? domainLabel(addr[2]) : null;
      const merchant = email.from_name || box || (email.from || "").replace(/<.*/, "").replace(/@.*/, "").replace(/[._-]+/g, " ").trim() || (email.subject || "").split(/ from | - /)[1] || null;
      const on = d ? (d[1] || new Date(Date.parse(d[2] + " UTC")).toISOString().slice(0, 10)) : (email.received_at ? ymd(email.received_at) : null);
      return { merchant, total_cents: t ? Math.round(Number(t[1].replace(/,/g, "")) * 100) : null, order, on, parsed: !!(t && merchant), source: email.from || "email", email_id: email.id || null };
    }
    function matchReceipt(receipt, transactions, windowDays) {
      if (!receipt.total_cents) return { matched: null, reason: "no total found in the email", candidates: [] };
      const w = windowDays || 4, rows = (transactions || []).map(t => Object.assign({}, t, { amount_cents: cents(t), posted_at: ymd(t.posted_at) }));
      const exact = rows.filter(t => -t.amount_cents === receipt.total_cents && (!receipt.on || Math.abs(daysBetween(receipt.on, t.posted_at)) <= w));
      const named = exact.filter(t => receipt.merchant && String(t.merchant_raw || "").toLowerCase().includes(String(receipt.merchant).toLowerCase().split(" ")[0]));
      const pick = (named.length === 1 ? named : exact.length === 1 ? exact : [])[0] || null;
      return { matched: pick ? pick.id : null, reason: pick ? (named.length === 1 ? "amount, date and merchant" : "amount and date") : exact.length > 1 ? `${exact.length} charges for ${money(receipt.total_cents)} in the window; say which` : "no charge for that amount in the window", candidates: exact.map(t => t.id), attach: pick ? { transaction_id: pick.id, kind: "receipt", title: `${receipt.merchant || "Receipt"} ${money(receipt.total_cents)}${receipt.order ? ` #${receipt.order}` : ""}`, amount_cents: receipt.total_cents, on: receipt.on, email_id: receipt.email_id } : null };
    }
    // TXN-016: a photo receipt is attached by what the user says it is; the agent does not pretend to read it.
    function attachPhoto(photo, stated, transactions) { if (!stated || !Number.isInteger(stated.amount_cents) || !stated.merchant) return { ask: "What is the total and the merchant on the receipt? I attach by what you tell me; I do not read the photo." }; const m = matchReceipt({ total_cents: stated.amount_cents, merchant: stated.merchant, on: stated.on || null }, transactions, 7); return Object.assign({ photo: { location: photo.location, sha256: photo.sha256 || null, taken_at: photo.taken_at || null } }, m); }

    // TXN-010: the unrecognized-charge triage ladder, in order of how often each step explains the charge.
    function triageCharge(t, ctx) {
      const c = ctx || {}, amt = cents(t), raw = String(t.merchant_raw || ""), L = typeof AgentLedger !== "undefined" ? AgentLedger : null, steps = [];
      const norm = L ? L.normalizeMerchant(raw) : { display: raw, key: raw.toLowerCase() };
      // Only a real descriptor mapping (AMZN MKTP to Amazon) counts; a title-cased unknown name explains nothing.
      if (norm.display.toLowerCase() !== norm.key && norm.display !== raw) steps.push({ step: "descriptor", text: `"${raw}" is how ${norm.display} shows up on statements.` });
      const rec = L && c.transactions ? L.recurring(c.transactions, c.today, c.rules).find(r => r.key === norm.key) : null; if (rec) steps.push({ step: "recurring", text: `It repeats ${rec.cadence} at about ${money(rec.amount_cents)}: a subscription or bill you already pay.` });
      const hist = (c.transactions || []).filter(x => x.id !== t.id && String(x.merchant_raw || "").toLowerCase() === raw.toLowerCase()); if (hist.length) steps.push({ step: "history", text: `${hist.length} earlier charge${hist.length === 1 ? "" : "s"} from the same descriptor, first ${ymd(hist.map(x => x.posted_at).sort()[0])}.` });
      if (t.is_pending) steps.push({ step: "pending", text: "Still pending: hotels, fuel and restaurants often authorize a different amount than they settle." });
      for (const p of c.household || []) if (p.cards && p.cards.includes(t.account_id)) steps.push({ step: "household", text: `${p.name} also uses this card; ask them before disputing.` });
      if (c.trials && c.trials.some(x => norm.key.includes(String(x.merchant).toLowerCase()))) steps.push({ step: "trial", text: "A free trial you started converted; that is the first paid charge." });
      const verdict = steps.some(s => ["recurring", "history", "trial", "household"].includes(s.step)) ? "likely yours" : steps.some(s => s.step === "descriptor") ? "probably yours; check the merchant name" : "unexplained";
      return { transaction_id: t.id, amount_cents: amt, merchant: norm.display, steps, verdict, next: verdict === "unexplained" ? `Nothing in your history explains ${norm.display} ${money(Math.abs(amt))}. If you did not make it: lock the card, then dispute; I draft the dispute and you file it.` : `${norm.display} ${money(Math.abs(amt))} is ${verdict}. If it still looks wrong, I can draft the dispute.`, capability_id: "TXN-010" };
    }

    // SEC-011: phishing detection on finance emails, by the signals that matter, with the reason stated; the user never gets a "safe" verdict, only "no signals found".
    const PHISH = [
      { id: "credential_ask", re: /\b(verify|confirm|update|re-?enter|provide)\b.{0,40}\b(password|passcode|pin|ssn|social security|one[- ]time code|otp|security code|login)\b/i, weight: 3, text: "asks for a password, code or identity number; no bank or rail does that by email" },
      { id: "urgency", re: /\b(within (24|48) hours|immediately|urgent|suspended|locked|final notice|account will be (closed|terminated)|act now)\b/i, weight: 2, text: "manufactures urgency" },
      { id: "link_mismatch", test: e => linkMismatch(`${e.subject || ""}\n${e.body || ""}`), weight: 3, text: "links to one site while its text names another" },
      { id: "lookalike_domain", re: /\b(?:[a-z0-9-]+\.)*(?:paypa1|payp4l|chase-secure|wellsfargo-?verify|bankofamerica-?alert|venm0|zel1e|secure-?login-?[a-z0-9]*)\.(?:com|net|co|info|xyz|top)\b/i, weight: 3, text: "uses a look-alike domain" },
      { id: "generic_greeting", re: /^(dear (customer|user|member|account holder|valued customer))/im, weight: 1, text: "opens with a generic greeting where your bank uses your name" },
      { id: "attachment_lure", re: /\b(open the attached|see attachment|attached (invoice|statement|document)|\.zip\b|\.exe\b|\.scr\b)/i, weight: 2, text: "pushes an attachment" },
      { id: "gift_cards_or_crypto", re: /\b(gift card|bitcoin|crypto|wire the funds|western union|moneygram)\b/i, weight: 3, text: "wants payment in gift cards, crypto or a wire" },
      { id: "reply_to_mismatch", test: e => { const r = domainOf(e.reply_to), f = domainOf(e.from); return !!(r && f && site(r) !== site(f)); }, weight: 2, text: "sends replies to a different domain than it came from" },
      { id: "sender_domain_mismatch", test: e => { const f = domainOf(e.from), brand = String(e.claims || "").toLowerCase().replace(/[^a-z0-9]/g, ""); return !!(f && brand && !site(f).split(".")[0].replace(/[^a-z0-9]/g, "").includes(brand)); }, weight: 2, text: "claims to be from one company but was sent from another domain" }
    ];
    // Domains read from the address itself ("Chase <alerts@chase.com>" is chase.com), compared by site (www.chase.com is chase.com).
    function domainOf(a) { const m = String(a || "").match(/@([a-z0-9.-]+)/i); return m ? m[1].toLowerCase() : null; }
    function site(h) { return String(h || "").toLowerCase().split(":")[0].replace(/^www\./, "").split(".").slice(-2).join("."); }
    function linkMismatch(text) { for (const m of String(text).matchAll(/href="https?:\/\/([^/"]+)[^"]*"[^>]*>([^<]*)/gi)) { const shown = (m[2].match(/\b((?:[a-z0-9-]+\.)+(?:com|net|org))\b/i) || [])[1]; if (shown && site(shown) !== site(m[1])) return true; } return false; }
    function phishing(email) {
      const text = `${email.subject || ""}\n${email.body || ""}`, hits = PHISH.filter(s => s.re ? s.re.test(text) : s.test(email)).map(s => ({ id: s.id, weight: s.weight, text: s.text }));
      const score = hits.reduce((s, h) => s + h.weight, 0), verdict = score >= 5 ? "phishing" : score >= 3 ? "suspicious" : "no signals found";
      return { verdict, score, signals: hits, text: verdict === "no signals found" ? "No phishing signals found. That is not a guarantee: go to the site by typing its address, never from the email." : `${verdict === "phishing" ? "Phishing" : "Suspicious"}: it ${hits.map(h => h.text).join("; ")}. Do not click or reply. If it names your bank, open the app or type the address yourself. I never ask for a code or password, and neither do they.`, capability_id: "SEC-011" };
    }
    // SEC-008: the agent's own session and device audit, user-inspectable; a new device or place is called out and can be revoked.
    function sessionAudit(sessions, now, opts) {
      const o = opts || {}, rows = (sessions || []).map(s => ({ id: s.id, device: s.device || "unknown device", location: s.location || "unknown place", started_at: s.started_at, last_seen_at: s.last_seen_at || s.started_at, active: s.revoked_at == null && (now - (s.last_seen_at || s.started_at)) < (o.idle_ms || 30 * DAY), current: !!s.current, revoked: !!s.revoked_at }));
      // A device the person revoked is not "known": it signing in again is new.
      const known = new Set(rows.filter(r => !r.revoked && r.started_at < now - 7 * DAY).map(r => `${r.device}|${r.location}`));
      const fresh = rows.filter(r => r.active && !r.current && r.started_at >= now - 7 * DAY && !known.has(`${r.device}|${r.location}`));
      return { sessions: rows, active: rows.filter(r => r.active), new_this_week: fresh, text: !rows.some(r => r.active) ? "No active sessions." : `${rows.filter(r => r.active).length} active session${rows.filter(r => r.active).length === 1 ? "" : "s"}: ${rows.filter(r => r.active).map(r => `${r.device} in ${r.location}${r.current ? " (this one)" : ""}`).join("; ")}.${fresh.length ? ` New this week and not you here: ${fresh.map(r => `${r.device} in ${r.location}`).join("; ")}. Say revoke and I end it.` : ""}`, capability_id: "SEC-008" };
    }
    function revokeSession(sessions, id, now) { const s = (sessions || []).find(x => x.id === id); if (!s) return { revoked: false, text: "No such session." }; if (s.current) return { revoked: false, text: "That is this session; sign out instead." }; s.revoked_at = now; return { revoked: true, text: `Ended ${s.device || "that session"}; it will have to sign in again, with a fresh code you approve.` }; }

    // TAX-003 / TAX-010: estimated-tax and filing calendars. The usual federal dates; a weekend or holiday moves a date to the next business day, so the user checks the year's notice.
    const TAX_DATES = [{ id: "q1", what: "Estimated tax Q1", mmdd: "04-15" }, { id: "q2", what: "Estimated tax Q2", mmdd: "06-15" }, { id: "q3", what: "Estimated tax Q3", mmdd: "09-15" }, { id: "q4", what: "Estimated tax Q4 (prior year)", mmdd: "01-15", next_year: true }, { id: "filing", what: "Individual return and extension request", mmdd: "04-15" }, { id: "extended", what: "Extended return", mmdd: "10-15" }, { id: "ira", what: "Prior-year IRA and HSA contributions", mmdd: "04-15" }];
    function taxCalendar(today, opts) {
      const o = opts || {}, y = Number(today.slice(0, 4)), rows = [];
      for (const d of TAX_DATES) { if (!o.estimated_payer && d.id.startsWith("q")) continue; for (const yy of [y, y + 1]) { const on = `${yy}-${d.mmdd}`; if (dayMs(on) >= dayMs(today) && daysBetween(today, on) <= (o.horizon_days || 400)) rows.push({ id: d.id, what: d.what, on, days: daysBetween(today, on), amount_cents: d.id.startsWith("q") && o.quarterly_cents ? o.quarterly_cents : null }); } }
      rows.sort((a, b) => a.on.localeCompare(b.on));
      return { items: rows, next: rows[0] || null, text: rows.length ? `Next: ${rows[0].what} on ${rows[0].on} (${rows[0].days === 0 ? "today" : dayCount(rows[0].days)})${rows[0].amount_cents ? `, ${money(rows[0].amount_cents)}` : ""}. ${rows.slice(1, 4).map(r => `${r.what} ${r.on}`).join("; ")}.` : "Nothing on the tax calendar in the horizon.", caveat: "Usual federal dates; a weekend or holiday moves a date to the next business day, and states differ.", capability_id: o.estimated_payer ? "TAX-003" : "TAX-010" };
    }
    function estimatedTax(ctx) { const c = ctx || {}, q = c.expected_tax_cents ? Math.ceil(c.expected_tax_cents / 4 / 100) * 100 : c.quarterly_cents || null; const cal = taxCalendar(c.today, { estimated_payer: true, quarterly_cents: q, horizon_days: c.horizon_days }); const paid = (c.payments || []).reduce((s, p) => s + p.amount_cents, 0); return Object.assign(cal, { quarterly_cents: q, paid_this_year_cents: paid, remaining_cents: c.expected_tax_cents ? Math.max(0, c.expected_tax_cents - paid) : null, text: `${cal.text}${c.expected_tax_cents ? ` Paid ${money(paid)} of about ${money(c.expected_tax_cents)} so far.` : ""}`, basis: c.expected_tax_cents ? "your expected tax for the year, as you gave it, divided by four" : "the quarterly amount you set" }); }
    // TAX-005: the donation log from transactions matched to charities the user named, with receipts attached from the vault.
    function donationLog(transactions, charities, v, year) {
      // Posted gifts only: a pending hold is the same gift before it posts, never a second one.
      const names = (charities || []).map(c => String(c).toLowerCase()), posted = (transactions || []).filter(t => !t.is_pending), rows = posted.filter(t => ymd(t.posted_at).startsWith(String(year)) && cents(t) < 0 && names.some(n => String(t.merchant_raw || "").toLowerCase().includes(n))).map(t => { const r = v ? v.list({ kind: "receipt", transaction_id: t.id })[0] : null; return { transaction_id: t.id, on: ymd(t.posted_at), charity: t.merchant_raw, amount_cents: -cents(t), receipt: r ? r.id : null }; });
      const total = rows.reduce((s, r) => s + r.amount_cents, 0), missing = rows.filter(r => !r.receipt && r.amount_cents >= 25000);
      return { year, rows, total_cents: total, receipts_missing: missing, text: `${year}: ${money(total)} to ${new Set(rows.map(r => r.charity)).size} organization${new Set(rows.map(r => r.charity)).size === 1 ? "" : "s"} across ${rows.length} gift${rows.length === 1 ? "" : "s"}.${missing.length ? ` ${missing.length} gift${missing.length === 1 ? "" : "s"} of $250 or more ${missing.length === 1 ? "has" : "have"} no written acknowledgment in the vault; the IRS wants one for each.` : ""}`, source: "your transactions", as_of: posted.map(t => ymd(t.posted_at)).sort().pop() || null, capability_id: "TAX-005" };
    }
    // TAX-012: refund tracking from the filing record and the IRS status the user pastes; the typical window stated as typical.
    function refundTracker(filing, today, status) {
      if (!filing || !filing.filed_on) return { state: "not_filed", text: "No filing on record yet." };
      const days = daysBetween(filing.filed_on, today), expected = addDays(filing.filed_on, filing.efile === false ? 42 : 21);
      const st = status && status.stage ? status.stage : null;
      // A return the IRS has received but that is past its window is overdue, never "by about" a date already gone.
      const paper = filing.efile === false, windowDays = paper ? 42 : 21;
      const state = st === "sent" ? "sent" : st === "approved" ? "approved" : days > windowDays ? "overdue" : st === "received" ? "received" : "in_window";
      return { state, filed_on: filing.filed_on, days_since: days, expected_by: expected, amount_cents: filing.refund_cents || null, text: { sent: `Refund ${filing.refund_cents ? money(filing.refund_cents) + " " : ""}sent${status && status.on ? ` on ${status.on}` : ""}; allow a few days to post.`, approved: "Approved; the deposit date comes next on the IRS tracker.", received: `Received by the IRS ${days} days ago; most ${paper ? "paper-filed" : "e-filed"} refunds arrive within ${windowDays} days, so by about ${expected}.`, overdue: `Filed ${days} days ago, past the typical ${filing.efile === false ? 42 : 21}-day window. Check Where's My Refund with your filing status and exact refund amount; a delay usually means a review or a mismatch, not a loss.`, in_window: `Filed ${filing.filed_on}; typical arrival by ${expected}.` }[state], caveat: "Typical windows, not a promise; the IRS tracker is the source.", capability_id: "TAX-012" };
    }

    return { vault, KINDS, policies, renewals, beneficiaryAudit, enrollmentWindows, PUBLIC_WINDOWS, parseReceipt, matchReceipt, attachPhoto, triageCharge, phishing, PHISH, sessionAudit, revokeSession, taxCalendar, estimatedTax, donationLog, refundTracker, money };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentDocuments;
