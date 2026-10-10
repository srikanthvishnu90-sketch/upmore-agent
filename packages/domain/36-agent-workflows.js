  /* Shared obligation and workflow planner. Pure: models may suggest facts;
     this module validates money, coverage, preconditions and action snapshots.
     Provider names are data. No biller-specific branches or fake payments. */
  const AgentWorkflows = (() => {
    const STATES = ["asserted", "verified", "disputed", "partially_paid", "settled", "waived", "invalid"];
    const KINDS = ["rent", "utility", "installment", "credit", "tax", "medical", "invoice", "insurance", "informal", "other"];
    const SOURCES = ["user", "biller", "document", "email", "bank"];
    const FINAL = ["settled", "waived", "invalid"];
    const text = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
    const cents = v => Number.isSafeInteger(v) && v >= 0 ? v : null;

    function moneyToCents(value) {
      if (value === null || value === undefined || value === "") return null;
      const s = String(value).trim().replace(/^\$/, "");
      if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
      const [whole, fraction = ""] = s.split(".");
      return cents(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
    }
    function date(value) {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const d = new Date(value + "T00:00:00Z");
      return isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
    }
    function safeUrl(value) {
      // Used for user handoffs, never for server-side fetches or proof of payee.
      try {
        const u = new URL(value);
        const h = u.hostname.toLowerCase();
        if (u.protocol !== "https:" || u.username || u.password || u.port ||
            !h.includes(".") || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
            /[\[\]:]/.test(h) || /\.(local|internal|localhost)$/.test(h)) return null;
        return u.href;
      } catch (_) { return null; }
    }
    function normalize(raw) {
      const r = raw || {};
      const errors = [];
      const currency = text(r.currency || "USD", 3).toUpperCase();
      const due = r.due_on ? date(r.due_on) : null;
      if (r.due_on && !due) errors.push("invalid_due_date");
      if (!/^[A-Z]{3}$/.test(currency)) errors.push("invalid_currency");
      if (!text(r.creditor, 160)) errors.push("creditor_required");
      if (r.amount_due_cents != null && cents(r.amount_due_cents) === null) errors.push("invalid_amount");
      if (r.minimum_due_cents != null && cents(r.minimum_due_cents) === null) errors.push("invalid_minimum");
      if (r.balance_cents != null && cents(r.balance_cents) === null) errors.push("invalid_balance");
      if (r.kind && !KINDS.includes(r.kind)) errors.push("invalid_kind");
      if (r.status && !STATES.includes(r.status)) errors.push("invalid_status");
      if (r.direction && !["payable", "receivable"].includes(r.direction)) errors.push("invalid_direction");
      if (r.source_type && !SOURCES.includes(r.source_type)) errors.push("invalid_source");
      return { ok: errors.length === 0, errors, obligation: {
        id: r.id || null, revision: Number.isSafeInteger(r.revision) && r.revision > 0 ? r.revision : 1,
        creditor: text(r.creditor, 160), provider_key: text(r.provider_key, 100) || null,
        provider_account_id: text(r.provider_account_id, 160) || null,
        reference: text(r.reference, 160) || null, source_key: text(r.source_key, 200) || null,
        kind: KINDS.includes(r.kind) ? r.kind : "other", direction: r.direction === "receivable" ? "receivable" : "payable",
        amount_due_cents: cents(r.amount_due_cents), minimum_due_cents: cents(r.minimum_due_cents),
        balance_cents: cents(r.balance_cents), currency, due_on: due,
        status: STATES.includes(r.status) ? r.status : "asserted",
        source_type: SOURCES.includes(r.source_type) ? r.source_type : "user",
        observed_at: text(r.observed_at, 40) || null,
        funding_account_id: text(r.funding_account_id, 160) || null,
        autopay: ["on", "off"].includes(r.autopay) ? r.autopay : "unknown",
        biller_url: safeUrl(r.biller_url),
        evidence: r.evidence && typeof r.evidence === "object" && !Array.isArray(r.evidence) ? r.evidence : {},
      }};
    }
    function snapshot(obligation, account, adapter, feeCents, nowIso) {
      const o = obligation;
      return {
        version: 1, obligation_id: o.id, obligation_revision: o.revision,
        action: "pay_obligation", creditor: o.creditor, provider_key: o.provider_key,
        provider_account_id: o.provider_account_id, reference: o.reference,
        amount_cents: o.amount_due_cents, currency: o.currency, due_on: o.due_on,
        funding_account_id: account.id, adapter_id: adapter.id, fee_cents: feeCents,
        expires_at: new Date(new Date(nowIso).getTime() + 15 * 60000).toISOString(),
      };
    }
    function stableJson(value) {
      if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
      if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stableJson(value[k])).join(",") + "}";
      return JSON.stringify(value);
    }
    function current(o, now, maxAgeMs) {
      const observed = Date.parse(o.observed_at || "");
      const at = Date.parse(now);
      return isFinite(observed) && isFinite(at) && observed <= at && at - observed <= maxAgeMs && !o.evidence.sync_error;
    }
    function route(o, adapters) {
      return (adapters || []).find(a => a.verified === true && a.actions && a.actions.includes("pay_obligation") &&
        a.providers && a.providers.includes(o.provider_key) && a.currencies && a.currencies.includes(o.currency) &&
        a.kinds && a.kinds.includes(o.kind) && a.idempotent === true && a.reconciles === true) || null;
    }
    function plan(raw, context) {
      const ctx = context || {}, n = normalize(raw), o = n.obligation;
      const steps = [];
      const result = (state, code, message, missing, proposal) => ({
        state, code, message, missing: missing || [], steps,
        obligation_id: o.id, obligation_revision: o.revision,
        handoff_url: o.biller_url, proposal: proposal || null,
      });
      if (!n.ok) return result("needs_information", "invalid_obligation", "Some bill details need correcting.", n.errors);
      steps.push({ action: "verify_obligation", state: "pending" });
      if (FINAL.includes(o.status)) return result("resolved", "already_resolved", "This obligation is already resolved.");
      if (ctx.stopped !== false) return result("blocked", "agent_stopped", "The agent is stopped or its permissions could not be loaded.");
      if (o.direction === "receivable") return result("needs_review", "collect_receivable", "This is money owed to you. Review a collection or follow-up workflow; it must not become an outgoing payment.");
      if (o.status === "disputed") return result("needs_review", "disputed", "Review this dispute before making a payment.");
      if (!["verified", "partially_paid"].includes(o.status)) return result("needs_review", "unverified", "Confirm who this bill belongs to and the current amount before paying.");
      if (o.amount_due_cents === null || !o.due_on) return result("needs_information", "missing_bill_details", "I need the current amount due and due date.",
        [o.amount_due_cents === null ? "amount_due_cents" : null, !o.due_on ? "due_on" : null].filter(Boolean));
      if (o.amount_due_cents === 0) return result("resolved", "nothing_due", "No amount is currently due.");
      if (!current(o, ctx.now, ctx.maxAgeMs || 48 * 3600000)) return result("needs_sync", "stale_obligation", "Refresh the bill before relying on its amount or payment status.", ["fresh_obligation"]);
      steps[0].state = "done";
      steps.push({ action: "check_existing_payment", state: "pending" });
      // A refreshed amount can still precede creditor allocation of an earlier
      // payment. Time alone, or an arbitrary evidence flag, cannot prove that
      // the new amount is the remaining debt. Until a trusted reconciliation
      // protocol exists, preserve the applied receipt and stop a second debit
      // against this exact invoice (including after a revision change).
      if ((ctx.attempts || []).some(a => a.obligation_id === o.id && a.status === "applied")) {
        return result("needs_sync", "applied_payment_reconciliation_required", "A payment was applied to this bill. Confirm the remaining debt with the creditor before proposing another payment.", ["creditor_remaining_debt_reconciliation"]);
      }
      if ((ctx.attempts || []).some(a => a.obligation_id === o.id && ["reserved", "submitted", "processing", "settled", "unknown"].includes(a.status))) {
        return result("monitoring", "payment_in_flight", "A payment is already pending. I'll wait for its result before proposing another.");
      }
      if (o.autopay === "on") return result("monitoring", "autopay_active", "Autopay is enabled. Verify its funding and result before considering an additional payment.");
      if (o.autopay !== "off") return result("needs_information", "autopay_unknown", "Check whether autopay or a pending payment already covers this bill.", ["autopay"]);
      steps[1].state = "done";
      const adapter = route(o, ctx.adapters);
      if (!adapter) return result("needs_connection", "unsupported_execution", "No verified payment connection covers this bill yet. Its details are saved; use the biller's payment flow or connect a supported method.", ["payment_connector"]);
      if (!o.provider_account_id || !o.reference) return result("needs_information", "missing_allocation", "Connect the exact biller account and invoice or loan so payment reaches the right obligation.", ["provider_account_id", "reference"]);
      const account = (ctx.accounts || []).find(a => a.id === o.funding_account_id && a.currency === o.currency && a.owned === true && a.payment_enabled === true);
      if (!account) return result("needs_connection", "funding_missing", "Choose a verified funding account that supports this payment.", ["funding_account"]);
      steps.push({ action: "check_funds", state: "pending" });
      if (cents(account.available_cents) === null || !current({ observed_at: account.observed_at, evidence: {} }, ctx.now, 15 * 60000)) {
        return result("needs_sync", "stale_funding", "Refresh available funds before approving this payment.", ["fresh_available_balance"]);
      }
      if (cents(adapter.fee_cents) === null) return result("needs_information", "fee_unknown", "The payment fee needs a verified quote.", ["fee_cents"]);
      // Uncovered liabilities cannot silently become zero in a cash forecast.
      if (ctx.cash_coverage_complete !== true || cents(ctx.other_obligations_cents) === null || cents(ctx.buffer_cents) === null) {
        return result("needs_information", "cash_coverage_unknown", "Confirm the other obligations and cash buffer used in this payment's affordability check.", ["cash_coverage"]);
      }
      const remaining = account.available_cents - o.amount_due_cents - adapter.fee_cents - ctx.other_obligations_cents;
      if (!Number.isSafeInteger(remaining) || remaining < ctx.buffer_cents) return result("blocked", "insufficient_funds", "This payment would leave less than your protected cash buffer.");
      steps[2].state = "done";
      steps.push({ action: "obtain_authorization", state: "pending" }, { action: "submit_payment", state: "pending" }, { action: "verify_application", state: "pending" });
      return result("awaiting_approval", "proposal_ready", "Review this payment. Nothing has been submitted.", [], snapshot(o, account, adapter, adapter.fee_cents, ctx.now));
    }
    function validateConsent(proposal, consent, now) {
      if (!proposal || !consent || consent.revoked_at || !consent.approved_at ||
          !isFinite(Date.parse(consent.approved_at)) || !isFinite(Date.parse(now)) ||
          Date.parse(consent.approved_at) > Date.parse(now) ||
          !isFinite(Date.parse(proposal.expires_at)) || Date.parse(proposal.expires_at) <= Date.parse(now)) return false;
      return stableJson(proposal) === stableJson(consent.snapshot);
    }
    function outcome(event, obligation, attempt) {
      // Only authenticated provider events reach this function in the server.
      const e = event || {}, o = obligation || {}, a = attempt || {};
      if (!e.provider_event_id || !e.provider_payment_id || e.provider_payment_id !== a.provider_payment_id ||
          e.reference !== o.reference || e.currency !== o.currency || cents(e.amount_cents) === null ||
          e.amount_cents !== a.amount_cents) return { ok: false, reason: "unmatched_event" };
      if (e.status === "returned") return { ok: true, attempt_status: "returned", resolved: false };
      if (e.status === "failed") return { ok: true, attempt_status: "failed", resolved: false };
      if (e.status === "applied") return { ok: true, attempt_status: "applied", resolved: e.amount_cents >= o.amount_due_cents };
      if (["submitted", "processing", "settled"].includes(e.status)) return { ok: true, attempt_status: e.status, resolved: false };
      return { ok: false, reason: "unknown_status" };
    }
    return { normalize, moneyToCents, date, safeUrl, plan, snapshot, stableJson, validateConsent, outcome, KINDS, STATES };
  })();
