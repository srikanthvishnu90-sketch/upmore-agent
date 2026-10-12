  /* The offer book (owner, Methods 1-3, 2026-10-11): every outside term a method relies on (a price, a window, a cap, a
     rate, a rule's threshold) is data with its source and the day it was checked, never a number inside code. Offers
     change weekly, so each term has a freshness window by kind; a term past its window is said as "may have changed:
     check before acting", never as current. packages/offers/terms.json holds the terms; tests/offer-book.test.cjs. */
  const OfferBook = (() => {
    // Days a term stays current, by kind: a promo changes weekly, a price monthly, a store policy quarterly, a federal rule
    // or published limit yearly.
    const FRESH_DAYS = Object.freeze({ promo: 7, price: 30, policy: 90, rule: 365 });
    const DAY = 86400000;
    const ISO = /^\d{4}-\d{2}-\d{2}$/;

    function validate(book) {
      const problems = [], ids = new Set();
      for (const t of (book && book.terms) || []) {
        const tag = t && t.id ? t.id : "?";
        if (!t || !/^[a-z0-9][a-z0-9_.-]*$/.test(t.id || "")) problems.push(`${tag}: id must be lowercase words`);
        if (ids.has(t.id)) problems.push(`${tag}: duplicate id`);
        ids.add(t.id);
        if (!FRESH_DAYS[t.kind]) problems.push(`${tag}: kind must be one of ${Object.keys(FRESH_DAYS).join(", ")}`);
        if (t.value === undefined || t.value === null || t.value === "") problems.push(`${tag}: no value`);
        if (!t.unit) problems.push(`${tag}: no unit`);
        if (!t.source || !t.source.title || !/^https:\/\//.test(t.source.url || "")) problems.push(`${tag}: source needs a title and an https link`);
        if (!ISO.test(t.checked_on || "")) problems.push(`${tag}: checked_on must be a date`);
        if (!Array.isArray(t.methods) || !t.methods.length) problems.push(`${tag}: methods must name the cards that use it`);
      }
      return problems;
    }

    function create(book) {
      const problems = validate(book);
      if (problems.length) throw new Error(`offer book: ${problems.join("; ")}`);
      const byId = new Map(book.terms.map(t => [t.id, t]));
      // A term as of today: its value, where it came from, and whether it is still current.
      function term(id, today) {
        const t = byId.get(id);
        if (!t) throw new Error(`offer book: no term ${id}`);
        const age = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${t.checked_on}T00:00:00Z`)) / DAY);
        if (!Number.isFinite(age)) throw new Error(`offer book: today must be a date, got ${today}`);
        const stale = age > FRESH_DAYS[t.kind] || age < 0;
        return { id, value: t.value, unit: t.unit, kind: t.kind, source: t.source, checked_on: t.checked_on, stale,
          cite: stale ? `per ${t.source.title}, checked ${t.checked_on}; that may have changed, so check before acting`
            : `per ${t.source.title}, checked ${t.checked_on}` };
      }
      const value = (id, today) => term(id, today).value;
      const all = () => [...byId.keys()];
      return { term, value, all };
    }

    return { FRESH_DAYS, validate, create };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = OfferBook;
