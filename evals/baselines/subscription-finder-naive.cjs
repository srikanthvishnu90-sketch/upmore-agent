// A stand-in for a category-leader subscription finder (doc 07 benchmark): any merchant charged two or more times at
// about the same amount is a subscription, everything flagged is reported as a saving, nothing is verified. This is
// a model of that behavior written here for a fair, re-runnable comparison, not those apps' code.
const SubscriptionFinderNaive = (() => {
  function key(raw) { return String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function inventory(transactions) {
    const by = {};
    for (const t of transactions || []) { if (!(t.amount < 0)) continue; const k = key(t.merchant_raw); (by[k] = by[k] || []).push(t); }
    return Object.keys(by).filter(k => { const txs = by[k]; if (txs.length < 2) return false; const amt = Math.abs(txs[0].amount); return txs.filter(t => Math.abs(Math.abs(t.amount) - amt) <= Math.max(amt * 0.05, 1)).length >= 2; })
      .map(k => ({ key: k, merchant: by[k][0].merchant_raw, monthly_cents: Math.round(Math.abs(by[k][by[k].length - 1].amount) * 100), claimed_saving_cents: Math.round(Math.abs(by[k][by[k].length - 1].amount) * 100), verified: false }));
  }
  return { inventory, key };
})();
module.exports = SubscriptionFinderNaive;
