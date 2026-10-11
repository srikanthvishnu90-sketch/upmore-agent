  /* Money math (Instinct spec docs 06, 12): the exact-cents primitives behind
     splits, fee-inclusive totals, percentages and due dates. Pure. Every
     function takes and returns integer cents, never floats, and every total
     reconciles to the cent: a split's shares sum to the amount, a
     fee-inclusive total is the amount plus the fee computed once with
     half-up rounding. Due dates are local calendar dates in the user's zone;
     a UTC timestamp near midnight never moves a bill to the wrong day. */
  const MoneyMath = (() => {
    const int = (c, what) => { if (!Number.isSafeInteger(c)) throw new Error(`${what || "amount"} must be an integer number of cents`); return c; };
    // Half-up rounding of a rational n/d to an integer, exact for integers (no floating point in the path).
    const divRound = (n, d) => { const q = Math.trunc(n / d), r = n - q * d; return Math.abs(r) * 2 >= Math.abs(d) ? q + Math.sign(n) * Math.sign(d) : q; };
    const format = c => { int(c); const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };

    // Equal split: the remainder cents go to the first payers, so shares sum exactly and differ by at most one cent.
    function split(amount_cents, ways) {
      int(amount_cents, "amount"); if (!Number.isInteger(ways) || ways < 1) throw new Error("ways must be a positive integer");
      const base = Math.trunc(amount_cents / ways), rem = amount_cents - base * ways, sign = Math.sign(rem) || 1;
      return Array.from({ length: ways }, (_, i) => base + (i < Math.abs(rem) ? sign : 0));
    }
    // Weighted split by integer weights (e.g. 2:1:1); largest-remainder method keeps the sum exact.
    function splitWeighted(amount_cents, weights) {
      int(amount_cents, "amount"); const total = weights.reduce((a, b) => a + b, 0); if (!total) throw new Error("weights must sum above zero");
      const raw = weights.map(w => ({ q: Math.trunc(amount_cents * w / total), r: (amount_cents * w) % total }));
      let left = amount_cents - raw.reduce((s, x) => s + x.q, 0);
      const order = raw.map((x, i) => i).sort((a, b) => raw[b].r - raw[a].r);
      for (const i of order) { if (!left) break; raw[i].q += Math.sign(left); left -= Math.sign(left); }
      return raw.map(x => x.q);
    }
    // Percentage of an amount in basis points, half-up.
    const pctOf = (amount_cents, bps) => divRound(int(amount_cents) * int(bps, "bps"), 10000);
    // Fee-inclusive total: amount + (amount * rate_bps / 10000) + fixed fee, each fee rounded once.
    function feeInclusive(amount_cents, rate_bps, fixed_cents) {
      const pct = pctOf(amount_cents, rate_bps || 0), fixed = int(fixed_cents || 0, "fixed fee");
      return { amount_cents, fee_cents: pct + fixed, total_cents: amount_cents + pct + fixed };
    }
    // The amount to charge so the payee nets exactly `net` after a percent and fixed fee (gross-up), checked by recomputation.
    function grossUp(net_cents, rate_bps, fixed_cents) {
      int(net_cents, "net"); let gross = divRound((net_cents + (fixed_cents || 0)) * 10000, 10000 - (rate_bps || 0));
      while (gross - feeInclusive(gross, rate_bps, fixed_cents).fee_cents < net_cents) gross++;
      while (gross > 0 && (gross - 1) - feeInclusive(gross - 1, rate_bps, fixed_cents).fee_cents >= net_cents) gross--;
      return gross;
    }
    const monthlyInterest = (balance_cents, apr_bps) => divRound(int(balance_cents) * int(apr_bps, "apr bps"), 120000);
    const annualFromMonthly = (monthly_cents, months) => int(monthly_cents) * (months || 12);
    // Share of a total in basis points, half-up: 22.0 percent is 2200.
    const shareBps = (part_cents, total_cents) => { int(part_cents); int(total_cents); if (!total_cents) return null; return divRound(part_cents * 10000, total_cents); };

    // Calendar date of an instant in a zone, as YYYY-MM-DD. A due date is a local date, so compare with this, never with the UTC date.
    function localDate(iso, tz) {
      const d = new Date(iso); if (isNaN(d)) throw new Error("bad timestamp");
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
      const get = t => parts.find(p => p.type === t).value;
      return `${get("year")}-${get("month")}-${get("day")}`;
    }
    // Whole days from today (local date) to the due date; negative means overdue.
    function daysUntil(due_ymd, now_iso, tz) {
      const today = localDate(now_iso, tz);
      return Math.round((Date.parse(due_ymd + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
    }
    return { split, splitWeighted, pctOf, feeInclusive, grossUp, monthlyInterest, annualFromMonthly, shareBps, localDate, daysUntil, format, divRound };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = MoneyMath;
