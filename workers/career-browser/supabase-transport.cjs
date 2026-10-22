"use strict";
/* supabase-transport.cjs — the worker host's Supabase transport
   (Lane E, Feature Depth Program v2; checklist §2 item 3).
   
   What this is: the production caller the batch stack always
   assumed and never had. createBatchRpcStore (batch-executor.cjs)
   takes an injected async call(name, args); the board service
   takes an injected board transport; until this module, NOTHING in
   workers/, scripts/, or the functions implemented a caller against
   Supabase — Lane D proved the executor against a local file-backed
   stand-in speaking the same wire shape, and production had no
   caller at all.
   
   The wire shape, exactly: POST {SUPABASE_URL}/rest/v1/rpc/<name>
   with the project service-role key as both `apikey` and the
   Bearer token, the args as the JSON body; the response body is
   the RPC's jsonb return. Table reads (the pool loader's readRows
   spec, the profile source's snapshot reads) ride the same
   transport: GET {SUPABASE_URL}/rest/v1/<table> with PostgREST
   select / eq or ilike filters / order / limit.
   
   CREDENTIAL DISCIPLINE (the checklist's placement rule): the
   service-role key arrives ONLY through this factory's options —
   in production, from the worker host's own environment via
   supabaseTransportFromEnv — and is held in this closure. It is
   never read from the repo, never written to disk by this module,
   never logged, and never interpolated into an error: transport
   failures throw BATCH_RPC_TRANSPORT_FAILED carrying the HTTP
   status and PostgREST's own code/message only (PostgREST errors
   do not echo the key). The batch RPCs are granted to service_role
   only; no other role can call them, which is why this transport
   exists on the worker host and nowhere else.
   
   Construction fails fast and named (SUPABASE_TRANSPORT_NOT_WIRED)
   when the base URL or the key is absent — an unconfigured worker
   stops before it can half-run, the worker stack's standing
   posture. */
const coded = (code, message) => Object.assign(new Error(message || code), { code });

function createSupabaseTransport(opts) {
  const o = opts || {};
  const baseUrl = typeof o.baseUrl === "string" ? o.baseUrl.replace(/\/+$/, "") : "";
  const key = typeof o.serviceRoleKey === "string" ? o.serviceRoleKey : "";
  if (!baseUrl || !key) throw coded("SUPABASE_TRANSPORT_NOT_WIRED", "createSupabaseTransport: baseUrl + serviceRoleKey are required — the key lives only in the worker host's environment, never in the repo");
  const doFetch = typeof o.fetchImpl === "function" ? o.fetchImpl : (typeof fetch === "function" ? fetch : null);
  if (!doFetch) throw coded("SUPABASE_TRANSPORT_NOT_WIRED", "createSupabaseTransport: no fetch implementation available in this runtime");
  const headers = () => ({ apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" });

  async function parseBody(res) {
    try {
      const text = await res.text();
      if (!text) return null;
      try { return JSON.parse(text); } catch { return null; }
    } catch { return null; }
  }
  function transportError(what, status, body) {
    const pgMessage = body && typeof body === "object" && body.message ? String(body.message) : null;
    const pgCode = body && typeof body === "object" && body.code ? String(body.code) : null;
    const e = coded("BATCH_RPC_TRANSPORT_FAILED", `${what} failed (HTTP ${status})${pgMessage ? `: ${pgMessage}` : ""}`);
    e.status = status;
    e.pgMessage = pgMessage;
    e.pgCode = pgCode;
    return e;
  }

  // The createBatchRpcStore transport: (name, args) -> the RPC's
  // jsonb return. Throws on any transport/HTTP failure — the
  // executor surfaces the throw as the intent's coded failure,
  // except claim refusals, which the store itself translates (see
  // createBatchRpcStore.claim).
  async function call(name, args) {
    if (!/^[a-z0-9_]+$/.test(String(name || ""))) throw coded("BATCH_RPC_NAME_INVALID", `createSupabaseTransport.call: refusing a malformed RPC name: ${String(name)}`);
    let res;
    try {
      res = await doFetch(`${baseUrl}/rest/v1/rpc/${name}`, { method: "POST", headers: headers(), body: JSON.stringify(args || {}) });
    } catch (e) {
      throw transportError(`RPC ${name}`, 0, { message: (e && e.message) || "network failure" });
    }
    const body = await parseBody(res);
    if (!res.ok) throw transportError(`RPC ${name}`, res.status, body);
    return body;
  }

  // The readRows spec the pool loader and the profile source share:
  // { table, select, filters: { column: { eq } } OR [{column,op,value}], order: { column,
  // ascending, nullsFirst }, limit } -> the rows array. Throws
  // coded on failure; each caller decides its own degrade (the
  // pool loader empties, profileFor stops named).
  async function readRows(spec) {
    const sp = spec || {};
    if (!sp.table || !/^[a-z0-9_]+$/.test(sp.table)) throw coded("SUPABASE_READ_INVALID", "readRows: a valid table name is required");
    const params = new URLSearchParams();
    params.set("select", sp.select || "*");
    if (sp.filters) {
      const filters = Array.isArray(sp.filters) ? sp.filters : Object.entries(sp.filters).map(([column, cond]) => {
        if (!cond || typeof cond !== "object" || Array.isArray(cond) || Object.keys(cond).join(",") !== "eq")
          throw coded("SUPABASE_READ_INVALID", "readRows: an explicit supported filter is required");
        return { column, op: "eq", value: cond.eq };
      });
      for (const filter of filters) {
        const { column, op, value } = filter || {};
        if (typeof column !== "string" || !/^[a-z0-9_]+$/.test(column) || ["select", "order", "limit", "offset", "or", "and"].includes(column))
          throw coded("SUPABASE_READ_INVALID", "readRows: refusing a malformed or reserved filter column");
        if (!["eq", "ilike"].includes(op) || !["string", "number", "boolean"].includes(typeof value) && value !== null ||
          op === "ilike" && typeof value !== "string")
          throw coded("SUPABASE_READ_INVALID", "readRows: refusing an unsupported filter operator or value");
        if (params.has(column)) throw coded("SUPABASE_READ_INVALID", "readRows: duplicate filter columns require an explicit supported query shape");
        params.set(column, `${op}.${value}`);
      }
    }
    if (sp.order && sp.order.column) {
      if (!/^[a-z0-9_]+$/.test(sp.order.column)) throw coded("SUPABASE_READ_INVALID", `readRows: refusing a malformed order column: ${sp.order.column}`);
      let ord = `${sp.order.column}.${sp.order.ascending ? "asc" : "desc"}`;
      if (sp.order.nullsFirst === false) ord += ".nullslast";
      else if (sp.order.nullsFirst === true) ord += ".nullsfirst";
      params.set("order", ord);
    }
    if (Number.isSafeInteger(sp.limit) && sp.limit > 0) params.set("limit", String(sp.limit));
    let res;
    try {
      res = await doFetch(`${baseUrl}/rest/v1/${sp.table}?${params.toString()}`, { method: "GET", headers: headers() });
    } catch (e) {
      throw transportError(`read ${sp.table}`, 0, { message: (e && e.message) || "network failure" });
    }
    const body = await parseBody(res);
    if (!res.ok) throw transportError(`read ${sp.table}`, res.status, body);
    if (!Array.isArray(body)) throw transportError(`read ${sp.table}`, res.status, { message: "PostgREST returned a non-array body" });
    return body;
  }

  async function readFirst(spec) {
    const rows = await readRows(Object.assign({}, spec, { limit: 1 }));
    return rows.length ? rows[0] : null;
  }

  return { call, readRows, readFirst };
}

// The operator's one-liner: the board-service pattern (configuration
// from the host's environment only, never from chat, never from the
// repo). SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are the worker
// host's own env names for the upmore project.
function supabaseTransportFromEnv(env) {
  const e = env || process.env;
  return createSupabaseTransport({ baseUrl: e.SUPABASE_URL || "", serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY || "" });
}

module.exports = { createSupabaseTransport, supabaseTransportFromEnv };
