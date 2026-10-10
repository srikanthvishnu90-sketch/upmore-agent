  /* Canonical financial evidence. Pure. The initial calculation scope is USD;
     other currencies retain original amounts and explicitly need a currency
     implementation. Fetch time is never substituted for provider data age. */
  const AgentFinancialModel = (() => {
    const DAY = 86400000;
    const kinds = ["checking", "savings", "cash", "credit", "investment", "loan", "other", "unknown"];
    const date = AgentWorkflows.date;
    const key = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    const iso = value => {
      const d = typeof value === "number" ? new Date(value * 1000) : new Date(value || "invalid");
      return isFinite(d.getTime()) ? d.toISOString() : null;
    };
    function signedCents(value, currency) {
      if (currency !== "USD" || value == null || value === "") return null;
      const s = String(value).trim();
      const negative = s.startsWith("-");
      const amount = AgentWorkflows.moneyToCents(negative ? s.slice(1) : s);
      return amount === null ? null : negative ? -amount : amount;
    }
    function identity(value) {
      return typeof value === "string" && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f]/.test(value) ? value : null;
    }
    function normalizeSimplefin(payload, metadata) {
      const p = payload || {}, m = metadata || {}, errors = [], accounts = [], transactions = [];
      if (!Array.isArray(p.accounts) || !Array.isArray(p.transactions) || p.accounts.length>500 || p.transactions.length>20000) return {ok:false,errors:["invalid_bank_response"],accounts,transactions};
      const fetched = iso(m.fetched_at), seen = new Set();
      if (!fetched) return {ok:false,errors:["fetch_time_required"],accounts,transactions};
      for (const raw of p.accounts) {
        const providerId = identity(raw && raw.id), currency = String(raw && raw.currency || "").toUpperCase();
        if (!providerId || !/^[A-Z]{3}$/.test(currency) || seen.has(providerId)) {
          return {ok:false,errors:["invalid_or_duplicate_account"],accounts:[],transactions:[]};
        }
        seen.add(providerId);
        const balance = signedCents(raw.balance,currency), available = signedCents(raw.available_balance,currency);
        let balanceAsOf = iso(raw.balance_date);
        if (balanceAsOf && balanceAsOf > fetched) { errors.push("future_balance_timestamp:"+providerId); balanceAsOf = null; }
        if (currency !== "USD") errors.push("unsupported_currency:"+providerId+":"+currency);
        else if (balance === null) errors.push("invalid_balance:"+providerId);
        if (!balanceAsOf) errors.push("balance_timestamp_unknown:"+providerId);
        accounts.push({account_id:"simplefin:"+providerId,provider:"simplefin",provider_account_id:providerId,
          name:String(raw.name || "Account").slice(0,160),currency,
          account_kind:kinds.includes(raw.account_kind) ? raw.account_kind : "unknown",
          balance_cents:balance,available_cents:available,balance_as_of:balanceAsOf,
          raw_balance:raw.balance == null ? null : String(raw.balance).slice(0,80),
          institution:String(raw.institution || "").slice(0,160) || null,fetched_at:fetched,
        });
      }
      const byId = new Map(accounts.map(a=>[a.provider_account_id,a]));
      const transactionIds = new Set();
      for (const raw of p.transactions) {
        const account = byId.get(raw && raw.account_id), id = identity(raw && raw.id);
        const posted = raw && raw.posted_at ? date(raw.posted_at) : null;
        if (!account || !id || (raw.posted_at && !posted) || (!raw.is_pending && !posted)) {
          return {ok:false,errors:["invalid_transaction_identity_or_date"],accounts:[],transactions:[]};
        }
        const idKey = account.account_id+":"+id;
        if (transactionIds.has(idKey)) return {ok:false,errors:["duplicate_transaction_id"],accounts:[],transactions:[]};
        transactionIds.add(idKey);
        const amount = signedCents(raw.amount,account.currency);
        if (amount === null && account.currency === "USD") return {ok:false,errors:["invalid_transaction_amount"],accounts:[],transactions:[]};
        const merchant = String(raw.merchant_raw || "Unknown").slice(0,300);
        transactions.push({account_id:account.account_id,provider_transaction_id:id,currency:account.currency,
          amount_cents:amount,raw_amount:String(raw.amount == null ? "" : raw.amount).slice(0,80),posted_on:posted,
          merchant_raw:merchant,merchant_key:key(merchant),is_pending:raw.is_pending === true,
          // Text such as AUTOPAY or Zelle does not establish an owned transfer.
          is_transfer:raw.is_transfer === true,
          pending_provider_id:identity(raw.pending_transaction_id),fetched_at:fetched,
        });
      }
      const providerErrors = Array.isArray(p.errlist) ? p.errlist.map(x=>String(x).slice(0,200)) : ["provider_error_status_unknown"];
      return {ok:true,accounts,transactions,errors:errors.concat(providerErrors),fetched_at:fetched,
        requested_start:date(m.requested_start),requested_end:date(m.requested_end),
        // A successful response is not proof of complete current bill/history coverage.
        coverage_complete:false};
    }
    function pendingLinks(transactions) {
      const rows = transactions || [], out = [];
      for (const posted of rows.filter(t=>!t.is_pending && t.pending_provider_id)) {
        const pending = rows.find(t=>t.account_id===posted.account_id && t.provider_transaction_id===posted.pending_provider_id && t.is_pending);
        if (pending) out.push({account_id:posted.account_id,pending_id:pending.provider_transaction_id,posted_id:posted.provider_transaction_id,basis:"provider_reference"});
      }
      return out;
    }
    function inferObligations(transactions, today, fetchedAt) {
      if (!date(today) || !iso(fetchedAt)) return [];
      const groups = new Map();
      const links = pendingLinks(transactions);
      const superseded = new Set(links.map(l=>l.account_id+":"+l.pending_id));
      for (const t of transactions || []) {
        if (t.currency !== "USD" || !Number.isSafeInteger(t.amount_cents) || t.amount_cents >= 0 || t.is_pending || t.is_transfer ||
            t.presence === "superseded" || superseded.has(t.account_id+":"+t.provider_transaction_id) || !date(t.posted_on) || !t.merchant_key) continue;
        const groupKey = AgentWorkflows.stableJson([t.account_id,t.currency,t.merchant_key]);
        if (!groups.has(groupKey)) groups.set(groupKey,[]);
        groups.get(groupKey).push(t);
      }
      const out = [];
      for (const rows of groups.values()) {
        rows.sort((a,b)=>a.posted_on.localeCompare(b.posted_on));
        // Three distinct occurrences; repeated same-day shopping cannot establish a schedule.
        const days = rows.map(t=>t.posted_on);
        if (rows.length<3 || new Set(days).size!==rows.length) continue;
        const gaps=days.slice(1).map((d,i)=>Math.round((Date.parse(d)-Date.parse(days[i]))/DAY));
        let interval=null;
        if (gaps.every(g=>g>=27 && g<=32)) interval="monthly";
        else if (gaps.every(g=>g>=6 && g<=8)) interval="weekly";
        else if (gaps.every(g=>g>=13 && g<=15)) interval="biweekly";
        else if (gaps.every(g=>g>=360 && g<=370)) interval="yearly";
        if (!interval) continue;
        const last=rows[rows.length-1], amount=Math.abs(last.amount_cents);
        if (rows.some(t=>Math.abs(Math.abs(t.amount_cents)-amount)>Math.max(100,Math.floor(amount*.05)))) continue;
        const expected=interval==="monthly" ? AgentMonitors.addMonths(last.posted_on,1)
          : interval==="yearly" ? AgentMonitors.addMonths(last.posted_on,12)
          : AgentMonitors.addDays(last.posted_on,interval==="weekly" ? 7 : 14);
        // Historical/inactive schedules aren't rolled forward into invented bills.
        if (expected < today) continue;
        out.push({source_key:"bank-pattern:"+AgentWorkflows.stableJson([last.account_id,last.merchant_key,expected]),
          creditor:last.merchant_raw.slice(0,160),kind:"other",direction:"payable",currency:"USD",amount_due_cents:amount,
          due_on:expected,status:"asserted",source_type:"bank",observed_at:iso(fetchedAt),
          funding_account_id:last.account_id,autopay:"unknown",provider_key:null,provider_account_id:null,reference:null,
          evidence:{rule:"Repeated posted debits suggest a future charge; they do not prove a current invoice or unpaid balance.",
            confidence:"inferred",interval,account_id:last.account_id,last_paid_on:last.posted_on,
            transaction_ids:rows.slice(-12).map(t=>t.provider_transaction_id),user_confirmation_required:true}});
      }
      return out;
    }
    function cashSummary(accounts, obligations, now, preferences) {
      const prefs=new Map((preferences || []).map(p=>[p.account_id,p.account_kind]));
      let available=0n, unknown=0, stale=0;
      const cash=[];
      for (const a of accounts || []) {
        const kind=prefs.get(a.account_id) || a.account_kind;
        if (!["checking","savings","cash"].includes(kind) || a.currency!=="USD" || a.status === "disconnected") { unknown++; continue; }
        if (!isFinite(Date.parse(now)) || !a.balance_as_of || !isFinite(Date.parse(a.balance_as_of)) || Date.parse(a.balance_as_of)>Date.parse(now) || Date.parse(now)-Date.parse(a.balance_as_of)>24*3600000 || a.sync_error) { stale++; continue; }
        if (!Number.isSafeInteger(a.available_cents)) { unknown++; continue; }
        available+=BigInt(a.available_cents); cash.push(a.account_id);
      }
      const payable=(obligations || []).filter(o=>o.currency==="USD" && o.direction==="payable" && !["settled","waived","invalid"].includes(o.status));
      let knownDue=0n,unverified=0;
      payable.forEach(o=>{
        if (["verified","partially_paid"].includes(o.status) && Number.isSafeInteger(o.amount_due_cents)) knownDue+=BigInt(o.amount_due_cents);
        else unverified++;
      });
      const safe=n=>n>=BigInt(Number.MIN_SAFE_INTEGER) && n<=BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null;
      return {currency:"USD",available_cents:cash.length ? safe(available) : null,
        known_due_cents:safe(knownDue),cash_account_ids:cash,
        unclassified_or_unavailable_accounts:unknown,stale_accounts:stale,unverified_obligations:unverified,
        coverage_complete:false,description:"Linked cash and recorded bills only; missing accounts or bills may change the picture."};
    }
    return {signedCents,normalizeSimplefin,pendingLinks,inferObligations,cashSummary,kinds};
  })();
