/* Memory-only controller. A connection is not payment authority. */
globalThis.UpmoreLedgerReview = function ({ identity, request, uuid }) {
  let epoch = 0, pending = null, writing = false;
  function invalidate(clearPending = true) { epoch++; if (clearPending) pending = null; }
  function scope() {
    const user = identity();
    if (!user?.owner || !user?.token) throw new Error("Sign in to review your bank activity.");
    const version = epoch;
    return { user, current: () => version === epoch && identity()?.owner === user.owner };
  }
  async function read(body) {
    const s = scope(), result = await request(body, s.user.token);
    if (!s.current()) return null;
    if (result.rows?.some(r => r.user_id !== s.user.owner || r.latest_review && r.latest_review.user_id !== s.user.owner)) throw new Error("Financial record ownership mismatch.");
    return result;
  }
  async function save(row, kind, category, linked = null) {
    if (writing) throw new Error("A classification is already being saved.");
    const s = scope();
    if (row.user_id !== s.user.owner) throw new Error("Choose your own transaction.");
    if (!['expense', 'income', 'loan_proceeds', 'other', 'unknown','refund','internal_transfer','credit_payment'].includes(kind)) throw new Error("Choose a classification.");
    if (!row.fact_hash) throw new Error("Refresh these bank facts before reviewing.");
    const review = {account_id: row.account_id, transaction_id: row.provider_transaction_id, fact_hash: row.fact_hash, kind, category: category.trim() || null};
    const pair = kind === 'internal_transfer' || kind === 'credit_payment';
    if (pair || kind === 'refund') {
      if (!linked || linked.user_id !== s.user.owner || !linked.fact_hash) throw new Error("Choose an owned linked record with current facts.");
      if (row.account_id === linked.account_id && row.provider_transaction_id === linked.provider_transaction_id) throw new Error("Choose a different linked record.");
      if (pair && review.category) throw new Error("Transfers and card payments are not spending categories.");
      if (kind === 'refund' && review.category) throw new Error("A refund inherits its original expense category.");
      Object.assign(review, {linked_account_id:linked.account_id,linked_transaction_id:linked.provider_transaction_id,linked_fact_hash:linked.fact_hash});
    } else if (linked) throw new Error("This classification does not use a linked record.");
    const signature = JSON.stringify(review);
    // A lost response may have committed. An unchanged retry keeps its ID.
    if (!pending || pending.signature !== signature || pending.owner !== s.user.owner) pending = {signature, owner: s.user.owner, id: uuid()};
    const id = pending.id;
    writing = true;
    try {
      const result = await request({action: pair ? 'classify_transaction_pair' : 'classify_transaction', confirmed: true, request_id: id, review}, s.user.token);
      if (!s.current()) return null;
      pending = null;
      return result;
    } finally { writing = false; }
  }
  return { read, save, invalidate };
};
