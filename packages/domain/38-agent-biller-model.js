  /* Trusted connector contracts. This validates server-fetched biller facts;
     it never turns client uploads or transaction patterns into biller proof. */
  const AgentBillerModel = (() => {
    const id = value => typeof value === "string" && value.length>0 && value.length<=160 && !/[\u0000-\u001f]/.test(value);
    function normalizeBatch(connection, records, now) {
      const errors=[], out=[], seen=new Set(), c=connection || {};
      if (c.status!=="active" || !id(c.provider_key) || !id(c.provider_account_id) || !c.capabilities || c.capabilities.read_obligations!==true) {
        return {ok:false,errors:["biller_connection_unavailable"],records:[]};
      }
      const at=Date.parse(now);
      if (!isFinite(at) || !Array.isArray(records) || records.length>500) return {ok:false,errors:["invalid_biller_batch"],records:[]};
      for (const raw of records) {
        if (!raw || !id(raw.external_id) || seen.has(raw.external_id) || raw.provider_account_id!==c.provider_account_id ||
            !Number.isSafeInteger(raw.source_version) || raw.source_version<1) {
          errors.push("invalid_biller_identity_or_version"); continue;
        }
        seen.add(raw.external_id);
        const observed=Date.parse(raw.observed_at || "");
        if (!isFinite(observed) || observed>at) {errors.push("invalid_source_timestamp");continue;}
        // Provider status 'paid' must have allocation evidence. A successful
        // bank debit alone is not proof that this invoice was credited.
        if (raw.status==="settled" && (!raw.evidence || !id(raw.evidence.applied_reference))) {
          errors.push("creditor_application_evidence_required");continue;
        }
        const normalized=AgentWorkflows.normalize({...raw,provider_key:c.provider_key,
          provider_account_id:c.provider_account_id,reference:raw.external_id,source_type:"biller",
          observed_at:new Date(observed).toISOString(),
          status:["verified","partially_paid"].includes(raw.status) && raw.unpaid_confirmed!==true ? "asserted" : raw.status,
          evidence:{...(raw.evidence || {}),connector_id:c.id,source_version:raw.source_version,
            unpaid_confirmed:raw.unpaid_confirmed===true},
        });
        if (!normalized.ok) {errors.push(...normalized.errors);continue;}
        out.push({external_id:raw.external_id,source_version:raw.source_version,obligation:normalized.obligation});
      }
      // Atomic rejection prevents a malformed correction from disappearing
      // while other records make the connection look successfully refreshed.
      return {ok:errors.length===0,errors,records:errors.length ? [] : out};
    }
    return {normalizeBatch};
  })();
