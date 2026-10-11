  /* Money recovery candidates from retained provider facts. Pure: it finds
     bank fees, possible duplicate charges and stale authorization holds, and
     drafts a request the user sends. A candidate is never money recovered;
     credit matches are unverified leads, never recovery proof. Merchant text
     can suggest a fee but never grants consent or proves an error or refund.
     This scanner has no trusted owner/account/fact-bound refund-linkage
     interface, so it cannot certify any amount as recovered. */
  const AgentRecovery = (() => {
    const safe = n => n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null;
    const DAY = 86400000;
    const days = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);
    const usd = c => {
      const minor = BigInt(c), magnitude = minor < 0n ? -minor : minor;
      return (minor < 0n ? "-$" : "$") + String(magnitude / 100n) + "." + String(magnitude % 100n).padStart(2, "0");
    };
    // Ordered: the first match names the fee. Reversal wording is excluded first.
    const FEES = [
      ["overdraft", /\b(overdraft|od)\s*(item\s*)?fee\b|\bOD\s+FEE\b/i],
      ["nsf", /\b(nsf|insufficient\s+funds|returned\s+item)\b/i],
      ["monthly_maintenance", /\b(monthly\s+(maintenance|service)|maintenance|service\s+(charge|fee)|account\s+fee)\b/i],
      ["atm", /\b(atm|non[- ]?network|out[- ]of[- ]network)\b.*\bfee\b|\bfee\b.*\batm\b/i],
      ["foreign_transaction", /\b(foreign\s+(transaction|txn|exchange)|international\s+(transaction|purchase))\s*fee\b/i],
      ["late_payment", /\blate\s*(payment\s*)?fee\b/i],
      ["paper_statement", /\bpaper\s+statement\s+fee\b/i]
    ];
    const REVERSAL = /\b(refund|reversal|reversed|credit|waive[dr]?|courtesy|rebate|adjustment)\b/i;
    const MAX_FEE_CENTS = 50000; // a fee label on a larger debit is not trusted as a fee
    const DUPLICATE_WINDOW_DAYS = 3, HOLD_STALE_DAYS = 7, REVERSAL_WINDOW_DAYS = 60;

    function identity(r) {
      if (!r || !r.account_id || !r.provider_transaction_id) throw new Error("Transaction identity is missing.");
      return AgentWorkflows.stableJson([r.account_id, r.provider_transaction_id]);
    }
    function label(r) { return String(r.merchant_raw || r.merchant_key || "").slice(0, 200); }
    function feeKind(r) {
      const t = label(r);
      if (!t || REVERSAL.test(t)) return null;
      for (const [kind, pattern] of FEES) if (pattern.test(t)) return kind;
      return null;
    }
    function evidence(r) {
      return {account_id: r.account_id, transaction_id: r.provider_transaction_id, fact_hash: r.fact_hash || null,
        amount_cents: r.amount_cents, posted_on: r.posted_on || null, label: label(r)};
    }
    function candidateId(kind, rows) {
      return kind + ":" + AgentWorkflows.stableJson(rows.map(r => [r.account_id, r.provider_transaction_id]).sort());
    }

    // Keeps one record per provider identity; conflicting facts stop the scan.
    function retained(rows, accountId, today) {
      if (!Array.isArray(rows) || rows.length > 100000) throw new Error("Transaction history exceeds the processing limit.");
      const seen = new Map(), posted = [], pending = [];
      let unsupported = 0, unavailable = 0, unknownHoldDate = 0, duplicateRows = 0, outOfScope = 0;
      for (const r of rows) {
        const id = identity(r);
        const signature = AgentWorkflows.stableJson([r.amount_cents, r.currency, r.posted_on, r.is_pending === true, r.is_transfer, r.merchant_key, r.merchant_raw, r.presence, r.fact_hash]);
        if (seen.has(id)) {
          if (seen.get(id) !== signature) throw new Error("Conflicting duplicate transaction facts.");
          duplicateRows++; continue;
        }
        seen.set(id, signature);
        if (accountId && r.account_id !== accountId) { outOfScope++; continue; }
        if (r.presence !== "observed") { unavailable++; continue; }
        if (r.currency !== "USD") { unsupported++; continue; }
        if (!Number.isSafeInteger(r.amount_cents)) throw new Error("Transaction amount is unknown or invalid.");
        if (r.is_pending === true && (r.posted_on == null || r.posted_on === "")) { unknownHoldDate++; continue; }
        if (typeof r.posted_on !== "string" || !AgentWorkflows.date(r.posted_on)) throw new Error("Transaction has an invalid date.");
        if (r.posted_on > today) throw new Error("Transaction has a future date relative to the current scan.");
        (r.is_pending === true ? pending : posted).push(r);
      }
      posted.sort((a, b) => a.posted_on < b.posted_on ? -1 : a.posted_on > b.posted_on ? 1 : identity(a) < identity(b) ? -1 : 1);
      pending.sort((a, b) => identity(a) < identity(b) ? -1 : 1);
      return {posted, pending, unsupported, unavailable, unknownHoldDate,
        coverage: {input_rows: rows.length, unique_facts: seen.size, duplicate_rows: duplicateRows, out_of_scope: outOfScope,
          included_posted: posted.length, included_pending: pending.length}};
    }

    // Heuristic leads only: account/merchant/wording/time proximity cannot
    // establish which charge a credit refunded. Each credit is suggested at
    // most once; a downstream reviewed linkage still requires trusted facts.
    function creditMatcher(credits, work) {
      const groups = new Map(), locations = new Map();
      const key = (account, kind, value) => AgentWorkflows.stableJson([account, kind, value]);
      const add = (k, c) => { if (!groups.has(k)) groups.set(k, {rows: []}); groups.get(k).rows.push(c); };
      for (const c of credits) {
        if (c.merchant_key) add(key(c.account_id, "merchant", c.merchant_key), c);
        if (REVERSAL.test(label(c))) {
          const kind = feeKind({merchant_raw: label(c).replace(REVERSAL, "")});
          if (kind) add(key(c.account_id, "fee", kind), c);
        }
      }
      for (const g of groups.values()) {
        g.size = 1; while (g.size < g.rows.length) g.size *= 2;
        g.tree = new Array(g.size * 2).fill(Infinity);
        g.rows.forEach((c, i) => {
          g.tree[g.size + i] = c.amount_cents;
          const id = identity(c); if (!locations.has(id)) locations.set(id, []);
          locations.get(id).push([g, i]);
        });
        for (let i = g.size - 1; i; i--) g.tree[i] = Math.min(g.tree[i * 2], g.tree[i * 2 + 1]);
      }
      const bound = (rows, date, upper) => {
        let lo = 0, hi = rows.length;
        while (lo < hi) { const mid = Math.floor((lo + hi) / 2);
          const timestamp = Date.parse(rows[mid].posted_on + "T00:00:00Z");
          if (timestamp < date || (upper && timestamp === date)) lo = mid + 1; else hi = mid;
        } return lo;
      };
      const first = (g, node, lo, hi, start, end, cap) => {
        work.credit_index_node_visits++;
        if (hi <= start || lo >= end || g.tree[node] > cap) return -1;
        if (hi - lo === 1) return lo;
        const mid = Math.floor((lo + hi) / 2), left = first(g, node * 2, lo, mid, start, end, cap);
        return left >= 0 ? left : first(g, node * 2 + 1, mid, hi, start, end, cap);
      };
      return (charge, sameMerchant) => {
        const g = groups.get(key(charge.account_id, sameMerchant ? "merchant" : "fee", sameMerchant ? charge.merchant_key : feeKind(charge)));
        if (!g) return null;
        const timestamp = Date.parse(charge.posted_on + "T00:00:00Z");
        const start = bound(g.rows, timestamp, false), end = bound(g.rows, timestamp + REVERSAL_WINDOW_DAYS * DAY, true);
        const index = first(g, 1, 0, g.size, start, end, -charge.amount_cents);
        if (index < 0) return null;
        const credit = g.rows[index];
        // Remove from both merchant and fee indexes to preserve single use.
        for (const [group, i] of locations.get(identity(credit))) {
          let node = group.size + i; group.tree[node] = Infinity;
          while (node > 1) { node = Math.floor(node / 2); group.tree[node] = Math.min(group.tree[node * 2], group.tree[node * 2 + 1]); }
        }
        return credit;
      };
    }

    function draft(kind, items, institution) {
      const where = String(institution || "your bank").slice(0, 80);
      const lines = items.map(r => `- ${r.posted_on}: ${label(r) || "charge"} ${usd(-r.amount_cents)} (reference ${String(r.provider_transaction_id).slice(0, 64)})`);
      if (kind === "duplicate_charge")
        return `Hello, I was charged twice for what appears to be the same purchase:\n${lines.join("\n")}\nPlease confirm whether one is a duplicate and refund it if so. Thank you.`;
      if (kind === "stale_hold")
        return `Hello, this pending authorization has not posted or released:\n${lines.join("\n")}\nPlease release the hold if no charge is due. Thank you.`;
      return `Hello, I'm requesting a courtesy refund from ${where} of this fee:\n${lines.join("\n")}\nI value my account and would appreciate the refund. Thank you.`;
    }

    function scan(rows, options) {
      const o = options || {};
      const today = o.today;
      if (typeof today !== "string" || !AgentWorkflows.date(today)) throw new Error("A real current date is required.");
      const {posted, pending, unsupported, unavailable, unknownHoldDate, coverage} = retained(rows, o.accountId, today);
      const work = {duplicate_pair_checks: 0, credit_index_node_visits: 0};
      const findPossibleRefund = creditMatcher(posted.filter(r => r.amount_cents > 0), work), candidates = [], claimed = new Set();
      const push = (kind, items, extra) => {
        const possibleRefund = extra.possibleRefund || null;
        const amount = kind === "duplicate_charge" ? -items[items.length - 1].amount_cents : items.reduce((s, r) => s - r.amount_cents, 0);
        candidates.push(Object.assign({
          id: candidateId(kind, items), kind, amount_cents: amount,
          status: "open", recovered_cents: null, remaining_cents: amount,
          reversal: null,
          possible_refund: possibleRefund ? evidence(possibleRefund) : null,
          refund_linkage_status: possibleRefund ? "unverified" : "not_found",
          evidence: items.map(evidence),
          action: amount > 0 ? {type: "draft_request", sent_by: "user", requires_user_approval: true, executes: false,
            text: draft(kind, items, o.institution),
            review_note: possibleRefund ? "A possibly related credit exists. Confirm which charge it concerns and the remaining request amount before sending; this draft does not establish that more money is owed." : null} : null
        }, extra.fields));
      };
      for (const r of posted) {
        if (r.amount_cents >= 0 || r.is_transfer === true) continue;
        const kind = feeKind(r);
        if (!kind || -r.amount_cents > MAX_FEE_CENTS) continue;
        claimed.add(identity(r));
        push("bank_fee", [r], {possibleRefund: findPossibleRefund(r, false),
          fields: {fee_kind: kind, age_days: days(r.posted_on, today)}});
      }
      // Possible duplicates: identical merchant identity and amount, posted close together.
      const duplicateGroups = new Map(), pairs = [], order = new Map();
      posted.forEach((r, i) => {
        order.set(r, i);
        if (r.amount_cents >= 0 || r.is_transfer === true || !r.merchant_key || claimed.has(identity(r))) return;
        const k = AgentWorkflows.stableJson([r.account_id, r.merchant_key, r.amount_cents]);
        if (!duplicateGroups.has(k)) duplicateGroups.set(k, []); duplicateGroups.get(k).push(r);
      });
      for (const group of duplicateGroups.values()) {
        for (let i = 0; i + 1 < group.length; i++) {
          work.duplicate_pair_checks++;
          if (days(group[i].posted_on, group[i + 1].posted_on) <= DUPLICATE_WINDOW_DAYS) {
            pairs.push([group[i], group[i + 1]]); i++;
          }
        }
      }
      pairs.sort((a, b) => order.get(a[0]) - order.get(b[0]));
      for (const [a, b] of pairs) {
          push("duplicate_charge", [a, b], {possibleRefund: findPossibleRefund(b, true),
            fields: {confidence: a.posted_on === b.posted_on ? "likely" : "possible",
              caveat: "Two identical charges can be legitimate, such as two separate purchases. Confirm before requesting a refund."}});
      }
      // Authorizations still pending well past normal settlement.
      for (const r of pending) {
        const age = days(r.posted_on, today);
        if (r.amount_cents >= 0 || age < HOLD_STALE_DAYS) continue;
        push("stale_hold", [r], {fields: {age_days: age,
          caveat: "A pending hold may still post. Hotel, rental and fuel holds can last longer than a week."}});
      }
      let open = 0n;
      for (const c of candidates) open += BigInt(c.remaining_cents);
      candidates.sort((a, b) => b.amount_cents - a.amount_cents || (a.id < b.id ? -1 : 1));
      return {currency: "USD", today, account_id: o.accountId || null, candidates,
        open_candidate_cents: safe(open), verified_recovered_cents: 0,
        recovery_verification: "unavailable_without_trusted_refund_linkage",
        excluded: {unsupported_currency: unsupported, unavailable, unknown_hold_date: unknownHoldDate},
        coverage, work,
        description: "Candidates only. Open amounts are not money owed or recovered. Credit matches are unverified leads; this scanner cannot certify recovery. Nothing is sent without the user."};
    }
    return {scan, feeKind};
  })();
