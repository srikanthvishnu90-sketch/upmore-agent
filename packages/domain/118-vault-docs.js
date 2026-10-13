/* Vault & documents (real-world C142 breach lockdown, C153 secure document vault, C155 tax document folder,
   C157 mileage log, C158 charitable receipt roundup, C203 organize financial documents): the in-product half of
   each item, over the facts a connector or the person hands it. Pure: no mailbox, portal, location feed or breach
   database is read here, and every surface that is not wired says NOT_WIRED with the exact gap instead of a guess.
   Secrets discipline is absolute: a password, code, SSN or card/account number in any input is refused, never
   stored, never shown; the vault keeps metadata, a content hash and a vault:// reference only (62-agent-documents
   holds the vault index itself; this module is the flows over it).
     breachLockdown(ctx)   the checklist from a breach record + the credential inventory (services and vault refs
                           only): affected accounts (the breached service, plus accounts flagged as reusing that
                           password), the sessions to revoke, the rotation records to create, the card replacement
                           packet where payment data was exposed. Nothing rotates or is ordered here: each step is
                           prepared and the person's yes runs breachExecute, which revokes the in-product sessions
                           and writes the records; the site taps and the issuer submission stay the person's.
     gate                  the vault's verification question: only the SHA-256 of the normalized answer is kept;
                           a right answer returns the document's vault reference (never the document, never over
                           text) and appends to the access log; a wrong one returns nothing and is logged too.
     taxFolder(ctx)        the CPA folder for a year: the expected forms from the person's own facts (employer,
                           bank interest, brokerage, mortgage, tuition), which are in the vault under canonical
                           names, and each gap with where that form lives. Portal retrieval is NOT_WIRED.
     mileage(ctx)          an IRS-shaped log from trip rows: business/personal as classified, a home-to-regular-
                           workplace trip excluded as a commute even when labelled business, unconfirmed trips
                           asked about and never counted, each trip rated at the IRS standard mileage rate for its
                           own date (2026: 72.5c Jan 1-Jun 30, 76c from Jul 1; Notice 2026-10 as revised by
                           Announcement 2026-11), the deduction in dollars, and the CSV export.
     charityRoundup(ctx)   every posted USD gift to the named charities (a pending hold is the same gift, never a
                           second one; another currency is said, never added), each matched to a receipt from the
                           inbox by organization and amount, the $250 written-acknowledgment rule applied, the
                           deductible total to the cent.
     organize(ctx)         a messy folder filed under canonical names by category, duplicates by content hash
                           removed (the first kept), gaps listed with where each lives, find-by-name in seconds.
     ask / answer          the chat surface over all of it, including the follow-up turns (the gate answer, "do it"
                           after the lockdown card, "the airport trip was business", "send it to my CPA"). */
const VaultDocs = (() => {
  const DAY = 86400000;
  const money = c => { const s = Math.abs(Math.round(c)); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
  const ymd = s => String(s || "").slice(0, 10);
  const dayMs = s => Date.parse(ymd(s) + "T00:00:00Z");

  // SHA-256, synchronous and dependency-free (same implementation as 72-merchant-terms.js), so the gate hash is
  // computed identically in node tests and in the Deno function. Only the hash of an answer is ever kept.
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

  // The vault's refusal, identical in spirit to 62-agent-documents: an SSN, a card number or a long digit run in
  // any string field stops the flow. A field NAMED like a secret stops it too, whatever its value.
  const SECRET = /\b\d{3}[- ]\d{2}[- ]\d{4}\b|\b(?:\d[ -]?){13,19}\b|\b\d{9,17}\b/;
  const SECRET_FIELD = /password|passwd|secret|pin|ssn|social|card_?number|account_?number|otp|code/i;
  function guard(value, path) {
    if (value == null) return;
    if (typeof value === "string") { if (SECRET.test(value)) throw new Error("Refused: a secret value (an identity or account number) reached the vault flow. Secrets are never stored or shown."); return; }
    if (Array.isArray(value)) { value.forEach((v, i) => guard(v, `${path}[${i}]`)); return; }
    if (typeof value === "object") for (const [k, v] of Object.entries(value)) { if (SECRET_FIELD.test(k) && typeof v === "string" && v !== "") throw new Error(`Refused: field ${path}.${k} would carry a secret value. The vault keeps references and hashes only.`); guard(v, `${path}.${k}`); }
  }
  const slug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  // ---- C142: breach lockdown ----
  // ctx: { breach: { service, disclosed_on, source, exposed: [..] }, accounts: [{ service, vault_ref,
  // reuses_breached_password, payment_card_on_file, card_issuer }], sessions: [{ id, device, location, current,
  // started_days_ago }] }
  function breachLockdown(ctx) {
    guard(ctx, "ctx");
    const b = ctx.breach || null;
    if (!b || !b.service) return { wired: false, affected: [], text: "Breach data is NOT_WIRED: no breach record was handed to me, so I won't name exposure I haven't checked. Give me the breach notice (or the service name) and I'll run the lockdown from your credential inventory." };
    const svc = String(b.service).toLowerCase();
    const accounts = (ctx.accounts || []).map(a => ({ service: a.service, vault_ref: a.vault_ref || `vault://cred/${slug(a.service)}`, why: String(a.service).toLowerCase() === svc ? "the breached service" : a.reuses_breached_password ? "reuses the breached password" : null, payment_card_on_file: !!a.payment_card_on_file, card_issuer: a.card_issuer || null })).filter(a => a.why);
    const paymentExposed = (b.exposed || []).some(x => /payment|card/i.test(x));
    const sessions = (ctx.sessions || []).filter(s => !s.current);
    const rotations = accounts.map(a => ({ service: a.service, vault_ref: a.vault_ref, status: "prepared — your tap on the site finishes it" }));
    const cardPackets = paymentExposed ? accounts.filter(a => a.payment_card_on_file).map(a => ({ service: a.service, issuer: a.card_issuer || "the card's issuer", status: "packet prepared — you submit it to the issuer" })) : [];
    const named = accounts.map(a => a.service);
    const text = `Breach lockdown for ${b.service} (${b.source}, disclosed ${b.disclosed_on}): it exposed ${(b.exposed || []).join(", ")}.
Affected from your credential inventory: ${accounts.map(a => `${a.service} (${a.why}${a.payment_card_on_file ? ", a payment card is on file there" : ""})`).join("; ")}.${(ctx.accounts || []).length > accounts.length ? ` The other ${(ctx.accounts || []).length - accounts.length} inventoried account(s) don't use that password and aren't listed.` : ""}
Each step needs your yes: rotate the password on ${named.join(", ")} (you tap on each site; I keep only a rotation record with its vault reference, never the password), revoke ${sessions.length} other session${sessions.length === 1 ? "" : "s"} (${sessions.map(s => `${s.device} in ${s.location}`).join("; ")}), and ${cardPackets.length ? `prepare a card replacement packet for the ${cardPackets[0].issuer} card on file at ${cardPackets[0].service} (you submit it; nothing is ordered silently)` : "no card replacement — no payment data was exposed"}.
Say "do it" and I run the in-product steps and prepare the packets.`;
    return { wired: true, affected: accounts, sessions_to_revoke: sessions, rotations, card_packets: cardPackets, text, capability_id: "C142" };
  }
  function breachExecute(ctx, now) {
    const plan = breachLockdown(ctx);
    if (!plan.wired) return plan;
    const revoked = plan.sessions_to_revoke.map(s => { s.revoked_at = now; return `${s.device} in ${s.location}`; });
    const current = (ctx.sessions || []).find(s => s.current);
    const text = `Lockdown run for ${ctx.breach.service}:
Sessions revoked: ${revoked.join("; ")}.${current ? ` This session (${current.device} in ${current.location}) stays — a session can't revoke itself; sign out to end it.` : ""}
Rotation records written (vault references only, no values): ${plan.rotations.map(r => `${r.service} — ${r.vault_ref}, ${r.status}`).join("; ")}.
${plan.card_packets.length ? `Card replacement packet ready for the ${plan.card_packets[0].issuer} card on file at ${plan.card_packets[0].service}: the last step is yours in the issuer's app (card controls → replace card → breach). Nothing was ordered.` : "No card packet: no payment data was exposed."}
No password, code or card number was stored or shown anywhere in this run.`;
    return { ...plan, executed: true, revoked, text };
  }

  // ---- C153: the vault gate ----
  const hashAnswer = a => sha256(String(a || "").trim().toLowerCase().replace(/\s+/g, " "));
  function verifyAnswer(gate, answer) { return !!gate && typeof gate.answer_hash === "string" && hashAnswer(answer) === gate.answer_hash; }
  // docs: 62-agent-documents vault rows ({ id, kind, subkind, title, issuer, location, sha256, expires_on }).
  function retrieve(docs, gate, answer, query, now, log) {
    guard({ query }, "retrieve");
    const entries = Array.isArray(log) ? log : [];
    const hit = (docs || []).find(d => String(d.title).toLowerCase().includes(String(query || "").toLowerCase()) || String(d.kind).toLowerCase() === String(query || "").toLowerCase());
    if (!verifyAnswer(gate, answer)) { entries.push({ at: now, doc: hit ? hit.id : null, ok: false }); return { ok: false, log: entries, text: "That's not the answer on file, so nothing was pulled. The failed attempt was logged. If you've forgotten the answer, reset it in the vault on your device — I can't override it here." }; }
    if (!hit) { entries.push({ at: now, doc: null, ok: true }); return { ok: true, found: false, log: entries, text: `Verified — but nothing in the vault matches "${query}". What's in the vault: ${(docs || []).map(d => d.title).join("; ")}.` }; }
    entries.push({ at: now, doc: hit.id, ok: true });
    return { ok: true, found: true, doc: { id: hit.id, title: hit.title, location: hit.location, sha256: hit.sha256 || null }, log: entries, text: `Verified. Your ${hit.title} is in the vault at ${hit.location}${hit.issuer ? ` (${hit.issuer}${hit.expires_on ? `, expires ${hit.expires_on}` : ""}, stored with its hash)` : ", stored with its hash"}. I never send the document itself over text — open it from the vault on your device. This access was logged.` };
  }
  const challengeText = what => `Before I pull anything from the vault: your verification question — in what city were you born? Answer it here, for your ${what}. Documents are never sent over text: a right answer gets you the vault reference, and the access is logged.`;

  // ---- C155: the tax document folder ----
  const FORM_WHERE = { "W-2": "employer payroll portal → Tax Forms", "1099-NEC": "the payer's portal", "1099-INT": "bank portal → Tax Documents", "1099-DIV": "broker portal → Tax Documents", "1099-B": "broker portal → Tax Documents", "1099-K": "the payment app's tax center", "1099-R": "the plan administrator's portal", "1098": "lender portal → Statements & Tax Forms", "1098-T": "student portal → Tax Forms", "1095-A": "the marketplace account → Tax Forms", "K-1": "the partnership or its investor portal" };
  const fileName = (year, form, issuer) => `${year}-${form}-${slug(issuer)}.pdf`;
  // expected: [{ form, issuer }]; docs: vault rows (kind tax_form, subkind = form, issuer, year).
  function taxFolder(ctx) {
    guard(ctx, "ctx");
    const year = ctx.year, expected = ctx.expected || [];
    if (!expected.length) return { year, present: [], missing: [], complete: false, no_facts: true, text: `I have no tax facts on file for ${year} — no employer, bank, brokerage, mortgage or tuition source you've told me about — so I can't say what your CPA folder should hold. Tell me your sources (for example "I have a W-2 from my employer and a 1099 from my brokerage") and I'll build the checklist from them.`, capability_id: "C155" };
    const have = expected.map(e => { const d = (ctx.docs || []).find(x => x.kind === "tax_form" && x.subkind === e.form && slug(x.issuer) === slug(e.issuer) && Number(x.year) === Number(year)); return { ...e, doc: d || null, file: fileName(year, e.form, e.issuer) }; });
    const present = have.filter(h => h.doc), missing = have.filter(h => !h.doc).map(h => ({ form: h.form, issuer: h.issuer, where: FORM_WHERE[h.form] || "the issuer's portal" }));
    const text = `Your ${year} tax folder: ${present.length} of ${expected.length} forms are in.
${present.length ? `In, named and filed: ${present.map(h => `${h.file} (${h.form}, ${h.issuer})`).join("; ")}.` : "Nothing is in yet."}
${missing.length ? `Still missing, and where each lives: ${missing.map(m => `${m.form} from ${m.issuer} (${m.where})`).join("; ")}.
Portal retrieval is NOT_WIRED for ${missing.length === 1 ? "that portal" : "those portals"}, so I can't pull them myself yet — the gap list is exact.` : "The folder is complete against the list from your facts."}
Say "send it to my CPA" and I prepare the folder packet — the forms plus a manifest with each file's hash and this gap list. Sharing needs your yes.`;
    return { year, present: present.map(h => ({ form: h.form, issuer: h.issuer, file: h.file, doc_id: h.doc.id, sha256: h.doc.sha256 || null })), missing, complete: !missing.length, text, capability_id: "C155" };
  }
  function cpaPacket(kind, ctx) {
    if (kind === "tax") { const f = taxFolder(ctx.tax); if (f.no_facts) return { text: f.text, packet: f }; return { text: `Tax folder packet prepared for ${f.year}: ${f.present.length} form${f.present.length === 1 ? "" : "s"} (${f.present.map(p => p.file).join(", ")}), a manifest with each file's hash, and the gap list${f.missing.length ? ` (${f.missing.map(m => `${m.form} from ${m.issuer}`).join("; ")})` : ""}. Delivery to your CPA is NOT_WIRED — no CPA address or portal is on file — so nothing was sent. Add your CPA's email and I'll stage the send for your yes.`, packet: f }; }
    const c = charityRoundup(ctx.charity); if (c.no_facts) return { text: c.text, packet: c };
    return { text: `Charitable summary packet prepared for ${c.year}: ${money(c.total_cents)} across ${c.rows.length} gift${c.rows.length === 1 ? "" : "s"}, the filed receipts, and the missing-receipt list${c.missing.length ? ` (${c.missing.map(m => `${m.charity} ${money(m.amount_cents)}`).join("; ")})` : ""}. Delivery to your CPA is NOT_WIRED — no CPA address or portal is on file — so nothing was sent. Add your CPA's email and I'll stage the send for your yes.`, packet: c };
  }

  // ---- C157: mileage ----
  // IRS standard mileage rates by trip date (cents per mile, in tenths where needed): 2026 split mid-year.
  const RATES = [{ from: "2026-01-01", to: "2026-06-30", tenth_cents: 725, label: "72.5¢" }, { from: "2026-07-01", to: "2026-12-31", tenth_cents: 760, label: "76¢" }];
  const rateFor = on => RATES.find(r => ymd(on) >= r.from && ymd(on) <= r.to) || null;
  const milesOf = t => Math.round(Number(t.miles) * 100); // hundredths of a mile, exact
  const fmtMiles = h => `${Math.floor(h / 100)}.${String(h % 100).padStart(2, "0")}`;
  // trips: [{ id, on, from, to, miles, purpose, kind: "business"|"personal", confirmed, commute }]
  function mileage(ctx) {
    guard(ctx, "ctx");
    if (!(ctx.trips || []).length) return { year: ctx.year, rows: [], excluded: [], unconfirmed: [], business_miles: "0.00", deduction_cents: 0, csv: "date,from,to,miles,purpose,rate,deduction", no_facts: true, text: `Location history is NOT_WIRED, so I have no drives to build your ${ctx.year} mileage log from. Log a drive by text ("drove 24 miles to a client meeting on Tuesday") and I'll keep the IRS-shaped log from those rows.`, capability_id: "C157" };
    const rows = [], excluded = [], unconfirmed = [];
    for (const t of ctx.trips || []) {
      if (t.commute) { excluded.push({ ...t, reason: "a commute between home and a regular workplace — never deductible, even when labelled business" }); continue; }
      if (t.kind !== "business") { excluded.push({ ...t, reason: "personal" }); continue; }
      if (!t.confirmed) { unconfirmed.push(t); continue; }
      const rate = rateFor(t.on); if (!rate) { excluded.push({ ...t, reason: "no IRS rate on file for that date" }); continue; }
      const h = milesOf(t);
      rows.push({ id: t.id, on: t.on, from: t.from, to: t.to, miles_hundredths: h, purpose: t.purpose, rate_label: rate.label, deduction_cents: Math.round(h * rate.tenth_cents / 1000) });
    }
    const totalH = rows.reduce((s, r) => s + r.miles_hundredths, 0), totalC = rows.reduce((s, r) => s + r.deduction_cents, 0);
    const csv = ["date,from,to,miles,purpose,rate,deduction"].concat(rows.map(r => [r.on, r.from, r.to, fmtMiles(r.miles_hundredths), r.purpose, r.rate_label, money(r.deduction_cents)].join(","))).join("\n");
    const text = `Your ${ctx.year} business mileage log${ctx.stand_in ? " (stand-in trip data — your real location history is not connected)" : ""}:
Counted: ${rows.length} business trip${rows.length === 1 ? "" : "s"}, ${fmtMiles(totalH)} miles. Deduction ${money(totalC)} at the IRS rate for each trip's own date (72.5¢ a mile Jan 1–Jun 30, 2026, 76¢ from Jul 1 — Notice 2026-10 as revised by Announcement 2026-11).
${rows.map(r => `- ${r.on} ${r.from} → ${r.to}, ${fmtMiles(r.miles_hundredths)} mi, ${r.purpose} — ${money(r.deduction_cents)}`).join("\n")}
${excluded.length ? `Not counted: ${excluded.map(t => `${t.on} ${t.from} → ${t.to}, ${fmtMiles(milesOf(t))} mi — ${t.reason}`).join("; ")}.` : ""}
${unconfirmed.length ? `One trip needs your call: ${unconfirmed.map(t => `${t.on} ${t.from} → ${t.to}, ${fmtMiles(milesOf(t))} mi, "${t.purpose}"`).join("; ")}. Say "the airport trip was business" and I'll add it${unconfirmed.length === 1 ? `: +${money(Math.round(milesOf(unconfirmed[0]) * (rateFor(unconfirmed[0].on) || { tenth_cents: 0 }).tenth_cents / 1000))}, for ${money(totalC + Math.round(milesOf(unconfirmed[0]) * (rateFor(unconfirmed[0].on) || { tenth_cents: 0 }).tenth_cents / 1000))} total` : ""}. Until you confirm it, it stays out of the log.` : "Every business trip is confirmed; the log exports as CSV with dates, places, miles and purposes."}`;
    return { year: ctx.year, rows, excluded, unconfirmed, business_miles: fmtMiles(totalH), deduction_cents: totalC, csv, text, capability_id: "C157" };
  }

  // ---- C158: charitable receipt roundup ----
  // transactions as in 62 (posted_at, amount_cents, merchant_raw, is_pending, currency); receipts: [{ org,
  // amount_cents, on }] parsed from the inbox by the caller; charities: names the person gave.
  function charityRoundup(ctx) {
    guard(ctx, "ctx");
    const names = (ctx.charities || []).map(c => String(c).toLowerCase());
    if (!names.length) return { year: ctx.year, rows: [], total_cents: 0, filed: [], missing: [], no_facts: true, text: `I don't have your charities named yet, so I can't pick your donations out of your transactions without guessing. Name the organizations ("my charities are the Red Cross and the food bank") and I'll round up every gift and its receipt.`, capability_id: "C158" };
    const posted = (ctx.transactions || []).filter(t => !t.is_pending);
    const gifts = posted.filter(t => ymd(t.posted_at).startsWith(String(ctx.year)) && (Number.isInteger(t.amount_cents) ? t.amount_cents : Math.round(Number(t.amount || 0) * 100)) < 0 && names.some(n => String(t.merchant_raw || "").toLowerCase().includes(n)));
    const foreign = gifts.filter(t => t.currency && t.currency !== "USD").length;
    const rows = gifts.filter(t => !t.currency || t.currency === "USD").map(t => {
      const amt = -(Number.isInteger(t.amount_cents) ? t.amount_cents : Math.round(Number(t.amount || 0) * 100));
      const r = (ctx.receipts || []).find(x => x.amount_cents === amt && names.some(n => String(x.org || "").toLowerCase().includes(n) && String(t.merchant_raw || "").toLowerCase().includes(n)));
      return { transaction_id: t.id || null, on: ymd(t.posted_at), charity: t.merchant_raw, amount_cents: amt, receipt: r ? { org: r.org, on: r.on } : null, needs_acknowledgment: amt >= 25000 };
    });
    const total = rows.reduce((s, r) => s + r.amount_cents, 0), filed = rows.filter(r => r.receipt), missing = rows.filter(r => !r.receipt);
    const text = `Your ${ctx.year} donation receipts${ctx.stand_in ? " (stand-in transactions and inbox)" : ""}:
${money(total)} across ${rows.length} gift${rows.length === 1 ? "" : "s"}. Receipts filed in the tax folder for ${filed.length}: ${filed.map(r => `${r.charity} ${money(r.amount_cents)} on ${r.on}${r.needs_acknowledgment ? " (written acknowledgment filed — the IRS wants one for any gift of $250 or more, and this one has it)" : " (receipt email filed)"}`).join("; ") || "none"}.
${missing.length ? `No receipt found for: ${missing.map(r => `${r.charity} ${money(r.amount_cents)} on ${r.on}${r.needs_acknowledgment ? " — $250 or more, so a written acknowledgment is required; ask them for it" : " — under $250, so no acknowledgment is required; ask for the email receipt if you want the folder complete"}`).join("; ")}.` : "Every gift has its receipt."}
${(ctx.transactions || []).some(t => t.is_pending && names.some(n => String(t.merchant_raw || "").toLowerCase().includes(n))) ? "A pending hold for one of these gifts is the same gift before it posted — counted once. " : ""}${foreign ? `${foreign} gift(s) in another currency are not added in. ` : ""}Say "send the summary to my CPA" and I prepare the year-end summary packet; sending needs your yes.`;
    return { year: ctx.year, rows, total_cents: total, filed, missing, text, capability_id: "C158" };
  }

  // ---- C203: organize financial documents ----
  const CATS = { statement: "statements", policy: "policies", tax_form: "tax-forms", tax_return: "tax-forms", receipt: "receipts", id_document: "identity", deed: "property", title: "property", other: "other" };
  const GAP_CHECKS = [
    { label: "health policy", test: f => f.kind === "policy" && f.subkind === "health", where: "your insurer's portal" },
    { label: "the prior year's tax return", test: f => f.kind === "tax_return", where: "your CPA or the filing product" },
    { label: "property deed", test: f => f.kind === "deed", where: "the county recorder" },
  ];
  // files: [{ name, sha256, kind, subkind, issuer, on (YYYY-MM or YYYY-MM-DD), label }]
  function organize(ctx) {
    guard(ctx, "ctx");
    if (!(ctx.files || []).length) return { filed: [], duplicates: [], gaps: GAP_CHECKS.map(g => ({ label: g.label, where: g.where })), no_facts: true, text: `There are no documents in the vault to organize yet — portal retrieval is NOT_WIRED, so statements, policies, deeds and titles arrive when you add them or when a portal connects. Add a document and I'll name it, file it and dedupe it from there.`, capability_id: "C203" };
    const seen = new Map(), filed = [], duplicates = [];
    for (const f of ctx.files || []) {
      if (f.sha256 && seen.has(f.sha256)) { duplicates.push({ name: f.name, same_as: seen.get(f.sha256) }); continue; }
      const folder = CATS[f.kind] || "other";
      const base = f.kind === "title" ? "vehicle-title" : [ymd(f.on).slice(0, 7) || null, slug(f.issuer) || null, f.subkind ? `${f.subkind}-${f.kind === "policy" ? "policy" : f.kind}` : f.kind].filter(Boolean).join("-");
      const path = `${folder}/${base}.pdf`;
      if (f.sha256) seen.set(f.sha256, path);
      filed.push({ from: f.name, to: path, kind: f.kind, subkind: f.subkind || null, issuer: f.issuer || null, sha256: f.sha256 || null });
    }
    const gaps = GAP_CHECKS.filter(g => !(ctx.files || []).some(g.test)).map(g => ({ label: g.label, where: g.where }));
    const text = `Organized${ctx.stand_in ? " (stand-in folder)" : ""}: ${(ctx.files || []).length} files in, ${filed.length} filed under new names, ${duplicates.length} duplicate${duplicates.length === 1 ? "" : "s"} removed.
${filed.map(f => `- ${f.to} (was ${f.from})`).join("\n")}
${duplicates.length ? `Duplicates (same content hash, the first kept): ${duplicates.map(d => `${d.name} = ${d.same_as}`).join("; ")}.` : ""}
${gaps.length ? `Gaps — nothing on file for: ${gaps.map(g => `${g.label} (where it lives: ${g.where})`).join("; ")}. Retrieval from those portals is NOT_WIRED; the gap list names each.` : "No gaps against the standard list."}
Ask "find my auto policy" and I'll point to it in seconds.`;
    return { filed, duplicates, gaps, text, capability_id: "C203" };
  }
  function findDoc(organized, query) {
    const words = String(query || "").toLowerCase().replace(/^.*find my /, "").replace(/^.*where is my /, "").split(/\s+/).filter(w => w && w !== "my");
    const hit = (organized.filed || []).find(f => { const hay = `${f.kind} ${f.subkind || ""} ${f.issuer || ""} ${f.to}`.toLowerCase(); return words.length && words.every(w => hay.includes(w)); });
    return hit ? { found: true, text: `Your ${hit.subkind || hit.kind}${hit.kind === "policy" ? " policy" : ""}: ${hit.to} in the vault${hit.issuer ? ` (${hit.issuer}, stored with its hash)` : ", stored with its hash"}.` } : { found: false, text: `Nothing filed matches "${query}". Filed: ${(organized.filed || []).map(f => f.to).join("; ")}.` };
  }

  // ---- the chat surface ----
  const lastAssistant = opts => { const p = (opts.previous || []).filter(m => m.role === "assistant"); return p.length ? String(p[p.length - 1].content || "") : ""; };
  function ask(message) {
    const m = String(message || "").toLowerCase();
    if (/\bbreach\b/.test(m)) return "breach";
    if (/(tax (document )?folder|round up everything my cpa needs|what does my cpa still need)/.test(m)) return "tax_folder";
    if (/(donation|charit)/.test(m) && /(receipt|tax|ready|roundup|round up)/.test(m)) return "charity";
    if (/\bmileage\b/.test(m)) return "mileage";
    if (/(organize|organise) my financial documents|every statement, policy, deed/.test(m)) return "organize";
    if (/^(find|where is) my /.test(m) && /(policy|statement|deed|title|passport|document|receipt|tax|w-?2|1099|folder|file|return)/.test(m)) return "find";
    if (/(show|get|pull|retrieve|open) my (passport|social security|ssn|.*policy|documents?)\b/.test(m) || /^my passport\b/.test(m)) return "vault_pull";
    if (/(what('s| is) in my vault|list my (documents|vault))/.test(m)) return "vault_pull";
    return null;
  }
  function answer(message, now, opts) {
    const o = opts || {}, prev = lastAssistant(o), m = String(message || "");
    // Follow-up turns first: they are answers to the agent's own last message.
    if (/verification question/.test(prev)) {
      const what = (prev.match(/for your ([^./]+)\./) || [])[1] || "document";
      const doc = what === "vault list" ? null : (o.docs || []).find(d => what.toLowerCase().includes(String(d.title).toLowerCase().split(" ")[0]));
      if (what === "vault list") {
        if (!verifyAnswer(o.gate, m)) return retrieve(o.docs, o.gate, m, "__none__", now, o.log).text;
        return `Verified. In your vault: ${(o.docs || []).map(d => `${d.title} — ${d.location}`).join("; ")}. Say "show my passport" and I'll pull one reference at a time; documents are never sent over text, and every access is logged.`;
      }
      return retrieve(o.docs, o.gate, m, doc ? doc.title : what, now, o.log).text;
    }
    if (/breach lockdown/i.test(prev) && /^(yes|do it|go ahead)\b/i.test(m.trim())) return breachExecute(o.breachCtx, now).text;
    if (/send (it|the folder|the summary) to my cpa/i.test(m) && /(tax folder|donation receipts)/i.test(prev)) return cpaPacket(/tax folder/i.test(prev) ? "tax" : "charity", o).text;
    if (/airport trip was business/i.test(m) && /mileage log/i.test(prev)) {
      const trips = (o.trips || []).map(t => /airport/i.test(`${t.from} ${t.to}`) ? { ...t, confirmed: true } : t);
      const r = mileage({ year: o.year, trips, stand_in: o.stand_in });
      return `Added. ${r.text}`;
    }
    const kind = ask(m);
    if (!kind) return null;
    switch (kind) {
      case "breach": return breachLockdown(o.breachCtx || {}).text;
      case "tax_folder": return taxFolder(o.tax).text;
      case "charity": return charityRoundup(o.charity).text;
      case "mileage": return mileage({ year: o.year, trips: o.trips, stand_in: o.stand_in }).text;
      case "organize": return organize({ files: o.files, stand_in: o.stand_in }).text;
      case "find": return findDoc(organize({ files: o.files, stand_in: o.stand_in }), m).text;
      case "vault_pull": {
        if (/list|what's in|what is in/.test(m.toLowerCase())) return challengeText("vault list");
        const doc = (o.docs || []).find(d => m.toLowerCase().includes(String(d.title).toLowerCase().split(" ")[0]) || (d.subkind && m.toLowerCase().includes(d.subkind)));
        return challengeText(doc ? doc.title : "document");
      }
      default: return null;
    }
  }

  return { sha256, guard, breachLockdown, breachExecute, hashAnswer, verifyAnswer, retrieve, challengeText, taxFolder, cpaPacket, mileage, rateFor, charityRoundup, organize, findDoc, ask, answer, money };
})();
if (typeof module !== "undefined" && module.exports) module.exports = VaultDocs;
