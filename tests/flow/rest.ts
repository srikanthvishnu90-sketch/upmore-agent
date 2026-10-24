// The table half of a Supabase service client over the flow harness's Postgres (tests/flow/pg.ts): from(table)
// .select / .insert / .upsert / .update / .delete with .eq / .in / .gte / .gt / .lt / .order / .range / .limit /
// .maybeSingle, as the edge functions' stores call it, turned into one SQL statement run as `service_role` (the edge
// functions' role) in its own transaction. rpc() is the harness's own. Only what the stores under test use is here:
// a call outside it throws, so a store that starts using more fails loudly rather than reading a wrong answer.
import type { Pg } from "./pg.ts";

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Error(`rest: unsupported name ${s}`);
  return s;
};
const lit = (v: unknown) => {
  if (v === null || v === undefined) return "null";
  const t = "r" + crypto.randomUUID().replace(/-/g, "");
  return `$${t}$${typeof v === "string" ? v : JSON.stringify(v)}$${t}$`;
};
// A column, or a JSON path read as text ("prefs->>on").
const col = (c: string) => {
  const m = c.match(/^([a-z_][a-z0-9_]*)->>([a-z_][a-z0-9_]*)$/);
  return m ? `(${ident(m[1])}->>'${m[2]}')` : ident(c);
};

type Op = "select" | "insert" | "upsert" | "update" | "delete";
export function restAdmin(pg: Pg) {
  return {
    rpc: (name: string, args?: Record<string, unknown>) => pg.asService().rpc(name, args),
    from(table: string) {
      const t = `public.${ident(table)}`;
      let op: Op = "select", cols = "*", body: Record<string, unknown> | null = null, conflict: string | null = null, returning = false;
      let count = false, single = false, order: string | null = null, limit: number | null = null, offset = 0;
      const where: string[] = [];
      const q: any = {
        select(c = "*", o?: { count?: string; head?: boolean }) {
          if (op === "select") cols = c; else returning = true;
          if (o?.count) count = true;
          return q;
        },
        insert(b: Record<string, unknown>) { op = "insert"; body = b; return q; },
        upsert(b: Record<string, unknown>, o: { onConflict: string }) { op = "upsert"; body = b; conflict = o.onConflict; return q; },
        update(b: Record<string, unknown>) { op = "update"; body = b; return q; },
        delete() { op = "delete"; return q; },
        eq(c: string, v: unknown) { where.push(`${col(c)} = ${lit(v)}`); return q; },
        in(c: string, vs: unknown[]) { where.push(vs.length ? `${col(c)} in (${vs.map(lit).join(", ")})` : "false"); return q; },
        gte(c: string, v: unknown) { where.push(`${col(c)} >= ${lit(v)}`); return q; },
        gt(c: string, v: unknown) { where.push(`${col(c)} > ${lit(v)}`); return q; },
        lt(c: string, v: unknown) { where.push(`${col(c)} < ${lit(v)}`); return q; },
        is(c: string, v: null) { if (v !== null) throw Error("rest: is() takes null"); where.push(`${col(c)} is null`); return q; },
        order(c: string, o?: { ascending?: boolean }) { order = `${col(c)} ${o?.ascending === false ? "desc" : "asc"}`; return q; },
        range(a: number, b: number) { offset = a; limit = b - a + 1; return q; },
        limit(n: number) { limit = n; return q; },
        maybeSingle() { single = true; return q; },
        then(ok: (r: any) => unknown, bad?: (e: unknown) => unknown) { return run().then(ok, bad); },
      };
      const filter = () => (where.length ? ` where ${where.join(" and ")}` : "");
      const pick = (keys: string[], j: string) => keys.map((k) => `(jsonb_populate_record(null::${t}, ${j})).${ident(k)}`).join(", ");
      const statement = () => {
        const j = body ? `${lit(body)}::jsonb` : "null";
        const keys = body ? Object.keys(body) : [];
        if (op === "select") {
          const sel = cols === "*" ? "*" : cols.split(",").map((c) => ident(c.trim())).join(", ");
          const inner = `select ${sel} from ${t}${filter()}${order ? ` order by ${order}` : ""}${limit !== null ? ` limit ${limit}` : ""}${offset ? ` offset ${offset}` : ""}`;
          return count ? `select jsonb_build_object('count', count(*)) from (${inner}) x` : `select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (${inner}) x`;
        }
        if (op === "insert") return `with w as (insert into ${t} (${keys.map(ident).join(", ")}) select ${pick(keys, j)} returning *) select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) from w`;
        if (op === "upsert") {
          const set = keys.filter((k) => k !== conflict).map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", ");
          return `with w as (insert into ${t} (${keys.map(ident).join(", ")}) select ${pick(keys, j)} on conflict (${ident(conflict!)}) do update set ${set} returning *) select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) from w`;
        }
        if (op === "update") return `with w as (update ${t} set ${keys.map((k) => `${ident(k)} = (jsonb_populate_record(null::${t}, ${j})).${ident(k)}`).join(", ")}${filter()} returning *) select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) from w`;
        return `with w as (delete from ${t}${filter()} returning *) select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) from w`;
      };
      async function run() {
        try {
          const out = await pg.sql(`begin;\nset local role service_role;\n${statement()};\ncommit;`);
          const data = JSON.parse(out.split("\n").filter(Boolean).at(-1) ?? "null");
          if (count) return { data: null, count: data.count, error: null };
          if (single) {
            if (data.length > 1) return { data: null, error: { message: "more than one row" } };
            return { data: data[0] ?? null, error: null };
          }
          return { data: op === "select" || returning ? data : null, error: null };
        } catch (e) {
          const message = String((e as Error).message).replace(/^psql:[^E]*ERROR:\s*/, "").split("\n")[0];
          return { data: null, error: { message, ...(/duplicate key/.test(message) ? { code: "23505" } : {}) } };
        }
      }
      return q;
    },
  };
}
