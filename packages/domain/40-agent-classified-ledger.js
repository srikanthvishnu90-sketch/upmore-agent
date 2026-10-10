/* Deterministic reports from provider facts plus explicit user reviews.
   No merchant name, model interpretation or matching amount grants consent. */
const AgentClassifiedLedger = (() => {
  const safe = n => n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null;
  const key = r => AgentWorkflows.stableJson([r.account_id,r.provider_transaction_id]);
  const kinds = ["expense","income","refund","internal_transfer","credit_payment","loan_proceeds","other","unknown"];
  function report(rows,reviews,from,to,accountId) {
    if(AgentWorkflows.date(from)!==from || AgentWorkflows.date(to)!==to || from>to)throw new Error("A real inclusive date range is required.");
    if(!Array.isArray(rows)||!Array.isArray(reviews)||rows.length>100000||reviews.length>100000)throw new Error("Ledger history exceeds the processing limit.");
    const transactions=new Map(),latest=new Map(),groups=new Map(),references=[];
    for(const row of rows){
      if(!row.account_id||!row.provider_transaction_id)throw new Error("Transaction identity is missing.");
      const id=key(row),prior=transactions.get(id);
      if(prior && AgentWorkflows.stableJson(prior)!==AgentWorkflows.stableJson(row))throw new Error("Conflicting duplicate transaction facts.");
      transactions.set(id,row);
    }
    for(const review of reviews){
      if(!Number.isSafeInteger(review.review_revision)||review.review_revision<1||!kinds.includes(review.kind))throw new Error("Invalid transaction review.");
      const id=key(review),prior=latest.get(id);
      if(prior && prior.review_revision===review.review_revision && AgentWorkflows.stableJson(prior)!==AgentWorkflows.stableJson(review))throw new Error("Conflicting duplicate transaction reviews.");
      if(!prior||prior.review_revision<review.review_revision)latest.set(id,review);
    }
    function fresh(review,row){
      return review && /^[a-f0-9]{64}$/.test(row.fact_hash||"") && review.fact_hash===row.fact_hash &&
        row.currency==="USD" && Number.isSafeInteger(row.amount_cents) && !row.is_pending && row.presence==="observed";
    }
    function classify(row){
      const review=latest.get(key(row));
      if(!review)return row.is_transfer===true?{kind:"provider_transfer",category:null,review:null}:{kind:"unknown",reason:"not_reviewed"};
      if(!fresh(review,row))return {kind:"unknown",reason:"facts_changed",review};
      const kind=review.kind;
      if((kind==="expense"&&row.amount_cents>=0)||(kind==="income"||kind==="loan_proceeds"||kind==="refund")&&row.amount_cents<=0)
        return {kind:"unknown",reason:"direction_conflict",review};
      if(["refund","internal_transfer","credit_payment"].includes(kind)){
        const linked=transactions.get(AgentWorkflows.stableJson([review.linked_account_id,review.linked_transaction_id]));
        const partner=linked&&latest.get(key(linked));
        if(!linked||linked.fact_hash!==review.linked_fact_hash||!fresh(partner,linked))return {kind:"unknown",reason:"linked_facts_or_review_missing",review};
        if(kind==="refund"){
          if(partner.kind!=="expense"||linked.amount_cents>=0||row.amount_cents> -linked.amount_cents||row.posted_on<linked.posted_on)
            return {kind:"unknown",reason:"original_expense_changed",review};
          return {kind,category:partner.category||null,review,linked};
        }
        if(linked.account_id===row.account_id||linked.amount_cents!==-row.amount_cents||row.amount_cents===0||partner.kind!==kind||
          partner.linked_account_id!==row.account_id||partner.linked_transaction_id!==row.provider_transaction_id||partner.linked_fact_hash!==row.fact_hash)
          return {kind:"unknown",reason:"opposite_leg_not_reconciled",review};
        return {kind,category:null,review,linked};
      }
      return {kind,category:review.category||null,review};
    }
    // Include every current linked refund when checking the original cost,
    // even if another refund falls outside this report's date range.
    const refunds=new Map();
    for(const row of transactions.values()){
      const c=classify(row);
      if(c.kind==="refund")refunds.set(key(c.linked),(refunds.get(key(c.linked))||0n)+BigInt(row.amount_cents));
    }
    let expense=0n,income=0n,refund=0n,loans=0n,unknown=0,stale=0,count=0,transfers=0,cards=0,other=0;
    const excluded={pending:0,unavailable:0,unsupported_currency:0};
    for(const row of transactions.values()){
      if(accountId&&row.account_id!==accountId)continue;
      if(row.is_pending){excluded.pending++;continue;}
      if(row.presence!=="observed"){excluded.unavailable++;continue;}
      if(AgentWorkflows.date(row.posted_on)!==row.posted_on)throw new Error("Posted record has an invalid date.");
      if(row.posted_on<from||row.posted_on>to)continue;
      if(row.currency!=="USD"){excluded.unsupported_currency++;continue;}
      if(!Number.isSafeInteger(row.amount_cents))throw new Error("Posted amount is unknown or invalid.");
      count++;let c=classify(row);
      if(c.kind==="refund" && refunds.get(key(c.linked))>BigInt(-c.linked.amount_cents))c={kind:"unknown",reason:"refunds_exceed_original_expense",review:c.review};
      if(c.kind==="unknown"){unknown++;if(c.reason && c.reason!=="not_reviewed")stale++;}
      else if(c.kind==="expense")expense-=BigInt(row.amount_cents);
      else if(c.kind==="income")income+=BigInt(row.amount_cents);
      else if(c.kind==="refund")refund+=BigInt(row.amount_cents);
      else if(c.kind==="loan_proceeds")loans+=BigInt(row.amount_cents);
      else if(c.kind==="internal_transfer"||c.kind==="provider_transfer")transfers++;
      else if(c.kind==="credit_payment")cards++;
      else other++;
      if(c.kind==="expense"||c.kind==="refund"){
        const category=c.category||"Uncategorized",group=groups.get(category)||{expense:0n,refund:0n};
        if(c.kind==="expense")group.expense-=BigInt(row.amount_cents);else group.refund+=BigInt(row.amount_cents);
        groups.set(category,group);
      }
      references.push({account_id:row.account_id,transaction_id:row.provider_transaction_id,fact_hash:row.fact_hash||null,
        fetched_at:row.fetched_at||null,kind:c.kind,reason:c.reason||null,category:c.category||null,review_revision:c.review?.review_revision||null,
        linked_fact_hash:c.review?.linked_fact_hash||null});
    }
    const complete=count>0&&unknown===0;
    return {currency:"USD",date_from:from,date_to:to,account_id:accountId||null,record_count:count,
      spending_cents:complete?safe(expense-refund):null,income_cents:complete?safe(income):null,
      known_expenses_cents:safe(expense),known_refunds_cents:safe(refund),known_net_spending_cents:safe(expense-refund),
      known_income_cents:safe(income),loan_proceeds_cents:safe(loans),classification_complete:complete,coverage_complete:false,
      unclassified_records:unknown,invalidated_reviews:stale,transfer_records:transfers,credit_payment_records:cards,other_records:other,excluded,
      excluded_count_scope:"Pending and unavailable counts cover retained account-scoped history; their posting dates may be unknown. Unsupported-currency counts use the requested period.",
      categories:[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([category,g])=>({category,expenses_cents:safe(g.expense),refunds_cents:safe(g.refund),net_spending_cents:safe(g.expense-g.refund)})),
      references,description:"Retained USD posted records only. User classifications are assertions bound to current provider facts. Refunds reduce spending in their posting period; they are not earned income. Unconnected accounts and missing history are not covered."};
  }
  return {report,kinds};
})();
