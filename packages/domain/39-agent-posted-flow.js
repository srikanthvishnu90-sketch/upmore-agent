  /* Retained posted bank activity, with exact USD aggregation. Bank credits
     are not automatically income and debits are not automatically spending:
     unidentified transfers, refunds and card payments need classification. */
  const AgentPostedFlow = (() => {
    const safe = n => n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null;
    function report(rows, from, to, accountId) {
      if (AgentWorkflows.date(from) !== from || AgentWorkflows.date(to) !== to || from > to) throw new Error("A real inclusive date range is required.");
      if (!Array.isArray(rows) || rows.length > 100000) throw new Error("Posted history exceeds the processing limit.");
      const seen = new Map(), groups = new Map(), references = [], dates = [];
      let debit = 0n, credit = 0n, count = 0, pending = 0, superseded = 0, unavailable = 0, unsupported = 0, transfers = 0, unclassified = 0;
      for (const r of rows) {
        if (accountId && r.account_id !== accountId) continue;
        if (r.is_pending) { pending++; continue; }
        if (r.presence === "superseded") { superseded++; continue; }
        if (r.presence !== "observed") { unavailable++; continue; }
        if (AgentWorkflows.date(r.posted_on) !== r.posted_on) throw new Error("Posted record has an invalid date.");
        if (r.posted_on < from || r.posted_on > to) continue;
        if (!r.account_id || !r.provider_transaction_id) throw new Error("Posted record identity is missing.");
        const id = AgentWorkflows.stableJson([r.account_id, r.provider_transaction_id]);
        const signature = AgentWorkflows.stableJson([r.amount_cents,r.currency,r.posted_on,r.is_transfer === true,r.merchant_key,r.merchant_raw]);
        if (seen.has(id)) {
          if (seen.get(id) !== signature) throw new Error("Conflicting duplicate transaction facts.");
          continue;
        }
        seen.set(id,signature);
        if (r.currency !== "USD") { unsupported++; continue; }
        if (!Number.isSafeInteger(r.amount_cents)) throw new Error("Posted amount is unknown or invalid.");
        if (r.is_transfer === true) { transfers++; continue; }
        const amount = BigInt(r.amount_cents), out = amount < 0n ? -amount : 0n, incoming = amount > 0n ? amount : 0n;
        debit += out; credit += incoming; count++; unclassified++;
        references.push({account_id:r.account_id,transaction_id:r.provider_transaction_id,amount_cents:r.amount_cents,posted_on:r.posted_on,fetched_at:r.fetched_at || null});
        dates.push(r.fetched_at && Number.isFinite(Date.parse(r.fetched_at)) ? new Date(r.fetched_at).toISOString() : null);
        const key = String(r.merchant_key || r.merchant_raw || "Unknown merchant");
        if (!groups.has(key)) groups.set(key,{merchant:key,label:String(r.merchant_raw || "Unknown merchant"),debits:0n,credits:0n,count:0});
        const g = groups.get(key); g.debits += out; g.credits += incoming; g.count++;
      }
      const merchants = [...groups.values()].sort((a,b)=>a.debits>b.debits?-1:a.debits<b.debits?1:a.merchant.localeCompare(b.merchant))
        .map(g=>({merchant_key:g.merchant,label:g.label,recorded_debits_cents:safe(g.debits),recorded_credits_cents:safe(g.credits),count:g.count}));
      return {currency:"USD",date_from:from,date_to:to,account_id:accountId || null,
        recorded_debits_cents:safe(debit),recorded_credits_cents:safe(credit),recorded_net_flow_cents:safe(credit-debit),
        spending_cents:null,income_cents:null,record_count:count,merchants,coverage_complete:false,
        excluded:{pending,superseded,unavailable,unsupported_currency:unsupported,provider_labeled_transfers:transfers},
        unclassified_records:unclassified,oldest_receipt_at:count && dates.every(Boolean) ? dates.sort()[0] : null,
        references,description:"Retained posted bank activity only. Unclassified transfers, refunds, loan proceeds and card payments can change true spending and income. Unconnected accounts and missing history are not covered."};
    }
    return {report};
  })();
