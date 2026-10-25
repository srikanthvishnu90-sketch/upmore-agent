// A PostgREST-shaped service client over the throwaway Postgres (tests/flow/pg.ts), so product code written against
// supabase-js (`admin.from(...).select(...).eq(...)`, `admin.rpc(...)`) runs unchanged in the connected-flow tests.
// Every query runs in one transaction as `service_role`, the edge functions' role. Only the calls the product's stores
// make are supported: select (with count/head), eq, in, or (ilike filters), overlaps, order, limit, maybeSingle,
// upsert with onConflict, and rpc. Anything else throws, so an unsupported call cannot pass silently.
import type { Pg } from "./pg.ts";

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") return `$j$${JSON.stringify(v)}$j$::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Error(`unsupported identifier ${s}`);
  return s;
};

export function restAdmin(pg: Pg) {
  const run = async (sql: string) => await pg.sql(`begin;\nset local role service_role;\n${sql};\ncommit;`);
  class Query {
    private cols = "*";
    private where: string[] = [];
    private ord = "";
    private lim = "";
    private single = false;
    private count = false;
    private head = false;
    private upsertRow: Record<string, unknown> | null = null;
    private conflict = "";
    constructor(private table: string) {
      ident(table);
    }
    select(cols = "*", o?: { count?: string; head?: boolean }) {
      // A column, or a JSON path read as text under its own name ("title:payload->>title").
      this.cols = cols.split(",").map((c) => {
        const m = /^([a-z_][a-z0-9_]*):([a-z_][a-z0-9_]*)->>([a-z_][a-z0-9_]*)$/.exec(c.trim());
        return m ? `${ident(m[2])}->>'${m[3]}' as ${ident(m[1])}` : ident(c.trim());
      }).join(", ");
      this.count = !!o?.count;
      this.head = !!o?.head;
      return this;
    }
    eq(c: string, v: unknown) {
      this.where.push(`${ident(c)} = ${lit(v)}`);
      return this;
    }
    in(c: string, vs: unknown[]) {
      this.where.push(vs.length ? `${ident(c)} in (${vs.map(lit).join(", ")})` : "false");
      return this;
    }
    overlaps(c: string, vs: unknown[]) {
      this.where.push(`${ident(c)} && array[${vs.map(lit).join(", ")}]::text[]`);
      return this;
    }
    or(expr: string) {
      const parts = expr.split(",").map((p) => {
        const m = /^([a-z_]+)\.ilike\.(.+)$/.exec(p.trim());
        if (!m) throw Error(`unsupported or() filter ${p}`);
        return `${ident(m[1])} ilike ${lit(m[2])}`;
      });
      this.where.push(`(${parts.join(" or ")})`);
      return this;
    }
    order(c: string, o?: { ascending?: boolean }) {
      this.ord = ` order by ${ident(c)} ${o?.ascending === false ? "desc" : "asc"}`;
      return this;
    }
    limit(n: number) {
      this.lim = ` limit ${Math.floor(n)}`;
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }
    // An insert is an upsert with no conflict target (a duplicate key is the database's error, as PostgREST returns it).
    insert(row: Record<string, unknown>) {
      return this.upsert(row);
    }
    upsert(row: Record<string, unknown>, o?: { onConflict?: string }) {
      this.upsertRow = row;
      this.conflict = o?.onConflict ? o.onConflict.split(",").map((c) => ident(c.trim())).join(", ") : "";
      return this;
    }
    private async exec(): Promise<{ data: any; error: { message: string } | null; count?: number }> {
      try {
        const w = this.where.length ? ` where ${this.where.join(" and ")}` : "";
        if (this.upsertRow) {
          const keys = Object.keys(this.upsertRow).map(ident);
          const vals = keys.map((k) => lit((this.upsertRow as any)[k]));
          const set = keys.map((k) => `${k} = excluded.${k}`).join(", ");
          await run(`insert into public.${this.table} (${keys.join(", ")}) values (${vals.join(", ")})` +
            (this.conflict ? ` on conflict (${this.conflict}) do update set ${set}` : ""));
          return { data: null, error: null };
        }
        if (this.count && this.head) {
          const n = await run(`select count(*) from public.${this.table}${w}`);
          return { data: null, error: null, count: Number(n.split("\n").at(-1)) };
        }
        const out = await run(`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select ${this.cols} from public.${this.table}${w}${this.ord}${this.lim}) t`);
        const rows = JSON.parse(out.split("\n").at(-1)!);
        return { data: this.single ? rows[0] ?? null : rows, error: null };
      } catch (e) {
        return { data: null, error: { message: String((e as Error).message) } };
      }
    }
    then<T>(ok: (r: { data: any; error: { message: string } | null; count?: number }) => T, bad?: (e: unknown) => T) {
      return this.exec().then(ok, bad);
    }
  }
  return {
    from: (table: string) => new Query(table),
    rpc: (name: string, args: Record<string, unknown>) => pg.asService().rpc(name, args),
  };
}
