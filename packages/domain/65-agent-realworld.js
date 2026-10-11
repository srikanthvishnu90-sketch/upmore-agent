  /* Real-world capability engine (docs/realworld/upmore-206-real-world-capabilities.md; map in
     packages/capabilities/realworld.json). A real-world capability is done when the world changed and
     the agent can prove it from a read-back, never when a task reports "completed". This module is the
     pure half of that bar for all 206 items: it names the connector path (a catalog adapter that exists,
     or NOT_WIRED), evaluates completion evidence per proof kind (done, not done, pending, unknown), names
     the steps that never run without a yes, and composes the failure message and the dollar statement
     with source and as-of. Nothing here talks to a rail; the loop and the connectors do. Pure. */
  const RealWorld = (() => {
    const money = c => { const s = Math.abs(Math.round(c)); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const isStr = (v, n) => typeof v === "string" && v.trim().length >= (n || 1);
    const isNum = v => typeof v === "number" && Number.isFinite(v);
    const SHA = /^[0-9a-f]{64}$/i;
    // Words that are a report, not evidence. Any evidence whose only content is one of these is unknown.
    const SAY_SO = /^(task )?(completed?|done|success(ful)?|ok|finished|sent|cancell?ed)\.?$/i;
    const NOT_WIRED = "NOT_WIRED";

    // Which evidence fields each proof kind needs, and what they mean. A kind is a verification surface: two
    // capabilities with the same kind still prove different things because the map's proof text names the counterparty.
    const KINDS = {
      feed_tie: { needs: ["rows", "total_cents"], means: "every number equals the sum of feed rows that each carry source and as-of" },
      push_delivered: { needs: ["delivered_at", "lines"], means: "a push was delivered and every line carries its source rows and a reply route" },
      alert_fired: { needs: ["fired_at", "value", "source", "as_of", "fired_count"], means: "the alert fired exactly once with the actual value, its source and time" },
      provider_state: { needs: ["expected_state", "record"], means: "the counterparty's own record reads the expected state" },
      confirmation_ref: { needs: ["counterparty", "reference"], means: "the counterparty issued a reference number" },
      fill: { needs: ["order_id", "status"], means: "the brokerage reports a fill (price, quantity, time) or a queued order outside market hours" },
      resting_order: { needs: ["order_id", "status", "params"], means: "the order rests at the brokerage with the requested parameters" },
      credit_posted: { needs: ["expected_cents", "credit_row"], means: "a credit row for the amount posted to the account" },
      delivery_confirmed: { needs: ["rail", "status"], means: "the rail reports delivered with a reference; staged is not delivered" },
      balance_delta: { needs: ["amount_cents", "from", "to"], means: "both account balances moved by the amount" },
      enrollment_verified: { needs: ["setting", "expected", "observed"], means: "the setting reads back as written, after the write" },
      document_in_vault: { needs: ["doc_id", "sha256"], means: "the document is stored with its hash" },
      research_cited: { needs: ["claims"], means: "every claim carries a source url and an as-of date" },
      guided_human_step: { needs: ["provider_readback"], means: "the provider's record shows the human step happened; the user's say-so alone is unknown" },
      payout_tracked: { needs: ["reference"], means: "a claim reference exists and the payout row posted" },
      freeze_confirmations: { needs: ["bureaus"], means: "one confirmation per bureau, PIN stored in the vault and never present in the evidence" }
    };
    const WRITE_KINDS = ["provider_state", "confirmation_ref", "fill", "resting_order", "credit_posted", "delivery_confirmed", "balance_delta", "enrollment_verified", "freeze_confirmations", "payout_tracked", "guided_human_step"];

    function load(map, catalog, registry) {
      const items = new Map(); for (const it of (map && map.items) || []) items.set(it.id, it);
      const providers = new Map(); for (const c of (catalog && catalog.connectors) || []) providers.set(c.provider, c);
      const caps = new Map(); for (const c of (registry && registry.capabilities) || []) caps.set(c.id, c);
      const get = id => { const it = items.get(id); if (!it) throw new Error(`unknown real-world capability ${id}`); return it; };

      function describe(id) {
        const it = get(id);
        return { id: it.id, title: it.title, group: it.group, say: it.say, registry: it.registry.slice(), connectors: it.connectors.slice(), proof_kind: it.proof_kind, proof: it.proof, gate: it.gate, failure: it.failure, writes: it.writes === true, tier: tierOf(it) };
      }
      const tierOf = it => it.registry.map(r => caps.get(r)).filter(Boolean).map(c => c.tier).sort().pop() || null;

      // The connector path: for each connector the item names, whether an adapter exists. ctx.connected lists the
      // provider ids the user has linked; ctx.adapters maps provider id -> { state: "live" | "sandbox" | "none" }.
      function plan(id, ctx) {
        const it = get(id), c = ctx || {}, connected = new Set(c.connected || []), adapters = c.adapters || {};
        const path = it.connectors.map(p => {
          if (p.startsWith("gap:")) return { connector: p, in_catalog: false, linked: false, adapter: "none", wired: false, reason: `${p.slice(4)} is not in the connector catalog` };
          const row = providers.get(p), a = adapters[p], state = a && a.state ? a.state : (row && /live/.test(row.adapter_state || "") ? "live" : "none");
          return { connector: p, in_catalog: !!row, linked: connected.has(p), adapter: state, wired: connected.has(p) && state !== "none", auth: row ? row.auth_method : null, reason: !row ? "not in the catalog" : !connected.has(p) ? "not linked by the user" : state === "none" ? "adapter not built" : null };
        });
        const live = path.find(p => p.wired) || null;
        const gated = it.registry.map(r => caps.get(r)).filter(c => c && c.status === "GATED").map(c => `${c.id}: ${c.gate_reason || "gated"}`);
        return { id, rail: live ? live.connector : NOT_WIRED, wired: !!live, path, gate: it.gate, writes: it.writes === true, gated, proof_kind: it.proof_kind, proof: it.proof };
      }

      // Completion. Returns { done: true | false | null, pending, reason, evidence }. null is unknown: no read-back, or say-so.
      function proof(id, evidence, opts) {
        const it = get(id), kind = it.proof_kind, k = KINDS[kind], o = opts || {};
        const out = (done, reason, extra) => Object.assign({ id, proof_kind: kind, done, pending: false, reason }, extra || {});
        if (evidence === null || evidence === undefined) return out(null, "no read-back");
        if (typeof evidence === "string") return out(null, SAY_SO.test(evidence.trim()) ? "a report is not evidence" : "evidence must be a read-back object");
        if (typeof evidence !== "object") return out(null, "evidence must be a read-back object");
        const e = evidence;
        if (e.status && typeof e.status === "string" && SAY_SO.test(e.status) && Object.keys(e).length === 1) return out(null, "a report is not evidence");
        const missing = k.needs.filter(f => e[f] === undefined || e[f] === null);
        if (missing.length) return out(null, `read-back lacks ${missing.join(", ")}`);
        switch (kind) {
          case "feed_tie": {
            const rows = Array.isArray(e.rows) ? e.rows : null; if (!rows || !rows.length) return out(null, "no feed rows");
            const bad = rows.find(r => !isNum(r.amount_cents) || !isStr(r.source) || !isNum(r.as_of)); if (bad) return out(false, "a row lacks amount, source or as-of");
            const sum = rows.reduce((n, r) => n + r.amount_cents, 0); if (sum !== e.total_cents) return out(false, `total ${money(e.total_cents)} does not equal the rows (${money(sum)})`);
            return out(true, "every number ties to feed rows", { total_cents: sum, as_of: Math.min(...rows.map(r => r.as_of)) });
          }
          case "push_delivered": {
            if (!isNum(e.delivered_at)) return out(false, "no delivery time");
            if (isNum(e.hour_wanted) && new Date(e.delivered_at).getUTCHours() !== e.hour_wanted) return out(false, "delivered outside the chosen hour");
            const lines = Array.isArray(e.lines) ? e.lines : []; if (!lines.length) return out(false, "empty push");
            const bad = lines.find(l => !(Array.isArray(l.row_ids) && l.row_ids.length) && !isStr(l.source)); if (bad) return out(false, "a line has no source");
            const noRoute = lines.find(l => !isStr(l.reply_capability)); if (noRoute) return out(false, "a line is not replyable");
            return out(true, "delivered, every line sourced and replyable");
          }
          case "alert_fired": {
            if (e.fired_count !== 1) return out(false, e.fired_count > 1 ? "fired more than once for one condition" : "did not fire");
            if (!isNum(e.fired_at) || !isStr(e.source) || !isNum(e.as_of) || e.value === undefined) return out(false, "alert lacks value, source or time");
            return out(true, "fired once with the actual value and time");
          }
          case "provider_state": {
            const rec = e.record; if (typeof rec !== "object" || !isStr(rec.state)) return out(null, "provider record unreadable");
            if (rec.state !== e.expected_state) return out(false, `provider record reads ${rec.state}, not ${e.expected_state}`);
            if (e.next_charge_at !== undefined && e.next_charge_at !== null) return out(false, "a next charge is still scheduled");
            return out(true, `provider record reads ${rec.state}`, { read_at: rec.read_at || e.read_at || null });
          }
          case "confirmation_ref": {
            if (!isStr(e.counterparty)) return out(null, "no counterparty");
            if (!isStr(e.reference, 4) || /^(pending|tbd|n\/a|none)$/i.test(e.reference.trim())) return out(false, "no reference issued");
            return out(true, `${e.counterparty} issued ${e.reference}`);
          }
          case "fill": {
            if (!isStr(e.order_id)) return out(null, "no order id");
            if (e.status === "rejected" || e.status === "cancelled") return out(false, `order ${e.status}`);
            if (e.status === "queued") { if (e.market_open === true) return out(false, "queued while the market is open"); return out(true, "queued until the open under a confirmed order id", { pending: true }); }
            if (e.status !== "filled") return out(null, `order status ${e.status}`);
            if (!isNum(e.fill_price_cents) || !isNum(e.quantity) || !isNum(e.filled_at)) return out(false, "fill lacks price, quantity or time");
            if (e.position && isNum(e.position.quantity) && e.position.quantity < e.quantity) return out(false, "position does not reflect the fill");
            return out(true, `filled ${e.quantity} at ${money(e.fill_price_cents)}`, { total_cents: Math.round(e.fill_price_cents * e.quantity) });
          }
          case "resting_order": {
            if (!isStr(e.order_id)) return out(null, "no order id");
            if (e.status !== "open") return out(e.status === "filled" || e.status === "expired" ? true : false, `order ${e.status}`);
            const p = e.params || {}, w = e.wanted || {};
            for (const f of Object.keys(w)) if (p[f] !== w[f]) return out(false, `${f} rests as ${p[f]}, not ${w[f]}`);
            return out(true, "resting with the requested parameters");
          }
          case "credit_posted": {
            const r = e.credit_row; if (typeof r !== "object") return out(null, "no credit row");
            if (!isNum(r.amount_cents) || !isNum(r.posted_at)) return out(false, "credit row lacks amount or posted time");
            if (r.amount_cents !== e.expected_cents) return out(false, `credit of ${money(r.amount_cents)} is not the ${money(e.expected_cents)} expected`);
            return out(true, `${money(r.amount_cents)} posted`, { total_cents: r.amount_cents, as_of: r.posted_at });
          }
          case "delivery_confirmed": {
            if (e.status === "staged" || e.status === "drafted") return out(false, "staged, not delivered");
            if (e.status === "failed" || e.status === "returned") return out(false, `rail reports ${e.status}`);
            if (e.status !== "delivered") return out(null, `rail reports ${e.status}`);
            if (!isStr(e.reference)) return out(false, "delivered without a rail reference");
            return out(true, `${e.rail} delivered, reference ${e.reference}`);
          }
          case "balance_delta": {
            const f = e.from || {}, t = e.to || {}; if (![f.before, f.after, t.before, t.after].every(isNum)) return out(null, "balances not read on both sides");
            if (f.before - f.after !== e.amount_cents) return out(false, "source balance did not move by the amount");
            if (t.after - t.before !== e.amount_cents) return out(false, "destination balance did not move by the amount");
            return out(true, `${money(e.amount_cents)} moved, both balances agree`, { total_cents: e.amount_cents });
          }
          case "enrollment_verified": {
            if (e.read_after_write === false) return out(null, "not read back after the write");
            if (JSON.stringify(e.observed) !== JSON.stringify(e.expected)) return out(false, `${e.setting} reads ${JSON.stringify(e.observed)}, not ${JSON.stringify(e.expected)}`);
            return out(true, `${e.setting} reads back as written`);
          }
          case "document_in_vault": {
            if (!isStr(e.doc_id) || !SHA.test(String(e.sha256))) return out(false, "no stored hash");
            return out(true, "stored with hash");
          }
          case "research_cited": {
            const cl = Array.isArray(e.claims) ? e.claims : []; if (!cl.length) return out(false, "no claims");
            const bad = cl.find(c => !/^https?:\/\//.test(String(c.source_url || "")) || !isStr(c.as_of)); if (bad) return out(false, "a claim has no source url or as-of");
            return out(true, `${cl.length} claims, each sourced`);
          }
          case "guided_human_step": {
            const r = e.provider_readback; if (typeof r !== "object") return out(null, "no provider read-back");
            if (r.exists !== true) return out(false, "the provider shows no such request");
            return out(true, "the provider's record shows the step", { user_confirmed_at: e.user_confirmed_at || null });
          }
          case "payout_tracked": {
            if (!isStr(e.reference, 4)) return out(false, "no claim reference");
            const p = e.payout_row; if (!p) return out(false, "payout not yet posted", { pending: true });
            if (!isNum(p.amount_cents) || !isNum(p.posted_at)) return out(false, "payout row lacks amount or posted time");
            return out(true, `${money(p.amount_cents)} landed`, { total_cents: p.amount_cents, as_of: p.posted_at });
          }
          case "freeze_confirmations": {
            const b = e.bureaus || {}, want = o.bureaus || ["equifax", "experian", "transunion"];
            for (const n of want) { const x = b[n]; if (!x) return out(false, `${n} has no confirmation`); if (x.pin !== undefined) return out(false, `${n} PIN is present in the evidence; PINs live in the vault only`); if (!isStr(x.confirmation, 4)) return out(false, `${n} confirmation missing`); if (x.pin_stored !== true && x.pin_issued !== false) return out(false, `${n} PIN not stored`); }
            return out(true, `${want.length} bureau confirmations`);
          }
          default: return out(null, "unknown proof kind");
        }
      }

      // What the user sees when the rail fails. Placeholders in the map are filled from ctx; unfilled ones stay honest ("that account").
      function failure(id, ctx) {
        const it = get(id), c = ctx || {};
        const fill = { provider: c.provider, account: c.account, bank: c.bank || c.provider, brokerage: c.brokerage || c.provider, issuer: c.issuer || c.provider, rail: c.rail || c.provider, venue: c.venue || c.provider, utility: c.utility || c.provider, portal: c.portal || c.provider, payroll: c.payroll || c.provider, custodian: c.custodian || c.provider, merchant: c.merchant || c.provider, gym: c.gym || c.provider, institution: c.institution || c.provider, "as-of": c.as_of ? new Date(c.as_of).toISOString().slice(0, 10) : null, status: c.status, n: c.n, m: c.m, months: c.months, cadence: c.cadence, person: c.person, biller: c.biller, card: c.card || c.provider, months_: null };
        return it.failure.replace(/<([a-z-]+)>/g, (s, k) => fill[k] !== undefined && fill[k] !== null ? String(fill[k]) : (k === "as-of" ? "its last sync" : "that " + k.replace(/-/g, " ")));
      }

      // The report line: dollars and confirmations, citing the source and as-of. Never "task completed".
      function statement(id, result, ctx) {
        const it = get(id), r = result || {}, c = ctx || {};
        const src = c.source ? ` (source: ${c.source}${r.as_of || c.as_of ? `, as of ${new Date(r.as_of || c.as_of).toISOString().slice(0, 10)}` : ""})` : "";
        if (r.done === true && !r.pending) return `${it.title}: done. ${r.reason}${isNum(r.total_cents) ? `, ${money(r.total_cents)}` : ""}${src}.`;
        if (r.done === true && r.pending) return `${it.title}: in flight. ${r.reason}${src}. I'll confirm when it lands.`;
        if (r.done === false) return `${it.title}: not done. ${r.reason}${src}.`;
        return `${it.title}: unknown. ${r.reason}${src}. I will not call it done until I can read it back.`;
      }

      // Audit status for one item from what exists today. Rail: LIVE (adapter live), SANDBOX (a faithful local counterparty), NOT_WIRED.
      function status(id, facts) {
        const it = get(id), f = facts || {}, depth = f.depth || {}, overlay = f.overlay || {};
        const st = it.registry.map(r => ({ id: r, status: (overlay[r] && overlay[r].status) || (caps.get(r) || {}).status || "CLAIMED" }));
        const tested = st.filter(s => s.status === "TESTED" || s.status === "VERIFIED").length;
        // Proven means this item's own depth packet (docs/depth/<id>.md, named in the map) is 15/15; a proven id that merely
        // appears among an item's registry ids proves nothing about the item (a limit order is not a market buy).
        const proven = it.depth && depth[it.depth] && depth[it.depth].proven === depth[it.depth].sub_capabilities && depth[it.depth].sub_capabilities >= 15 ? [it.depth] : [];
        const logic = proven.length ? "LOGIC_PROVEN" : tested === st.length ? "LOGIC_TESTED" : tested ? "PARTLY_TESTED" : "DESIGNED";
        const wired = it.connectors.some(p => { const row = providers.get(p); return row && /live/.test(row.adapter_state || ""); });
        const rail = wired ? "LIVE" : it.sandbox ? "SANDBOX" : NOT_WIRED;
        const gaps = it.connectors.filter(p => p.startsWith("gap:")).map(p => p.slice(4));
        return { id, logic, rail, tested, of: st.length, proven, gaps, registry: st };
      }

      return { describe, plan, proof, failure, statement, status, ids: () => [...items.keys()], item: get };
    }
    return { load, KINDS, WRITE_KINDS, NOT_WIRED, money };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = RealWorld;
