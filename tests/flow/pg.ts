// Connected-flow harness (backend gap map G1): a throwaway Postgres with the career schema (tests/flow/provision-pg.sh,
// the same migration order as CI's tests/db/run.sh, never the draft card-cloud bridge), and an RPC client that calls the
// database's own functions exactly as PostgREST does for a signed-in person: in one transaction, as the `authenticated`
// role, with that person's JWT subject. No call runs as a superuser on the person's behalf; setup that is not the person
// acting (creating their account rows) goes through `asService`, the edge functions' role, and is named as setup.
// Nothing here reaches the live project.

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

export function pgBinDir(): string | null {
  const env = Deno.env.get("PGBIN");
  for (const dir of [env, "/usr/lib/postgresql/16/bin"]) {
    if (!dir) continue;
    try {
      Deno.statSync(`${dir}/initdb`);
      return dir;
    } catch { /* next */ }
  }
  return null;
}

export interface Pg {
  host: string;
  port: number;
  stop: () => Promise<void>;
  sql: (text: string) => Promise<string>;
  asPerson: (userId: string) => RpcClient;
  asService: () => RpcClient;
}
export interface RpcClient {
  rpc: (name: string, args?: unknown) => Promise<{ data: any; error: { message: string } | null }>;
}

async function run(cmd: string, args: string[], stdin?: string, env?: Record<string, string>) {
  const child = new Deno.Command(cmd, { args, stdin: stdin === undefined ? "null" : "piped", stdout: "piped", stderr: "piped", env }).spawn();
  if (stdin !== undefined) {
    const w = child.stdin.getWriter();
    await w.write(new TextEncoder().encode(stdin));
    await w.close();
  }
  const out = await child.output();
  return { code: out.code, stdout: new TextDecoder().decode(out.stdout), stderr: new TextDecoder().decode(out.stderr) };
}

// `includeBridge`: also the draft card-cloud bridge, at its filename position (tests/architect/bridge-ledger-order.test.ts).
export async function startPg(opts: { includeBridge?: boolean } = {}): Promise<Pg> {
  const bin = pgBinDir();
  if (!bin) throw Error("NO_POSTGRES");
  const work = await Deno.makeTempDir({ prefix: "trainee-flow-pg-" });
  const port = 55000 + Math.floor(Math.random() * 4000);
  const prov = await run("bash", [`${ROOT}/tests/flow/provision-pg.sh`, work, String(port)], undefined, {
    ...Deno.env.toObject(), PGBIN: bin, INCLUDE_BRIDGE: opts.includeBridge ? "1" : "",
  });
  if (prov.code !== 0) throw Error(`provision failed: ${prov.stderr.slice(-800)}`);
  const base = ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-h", work, "-p", String(port), "-U", "postgres", "-d", "postgres"];
  const sql = async (text: string) => {
    const r = await run("psql", base, text);
    if (r.code !== 0) throw Error(r.stderr.trim());
    return r.stdout.trim();
  };
  // Argument names and types, and whether the function returns a set, read from the catalog (what PostgREST does).
  const sig = new Map<string, { names: string[]; types: string[]; set: boolean }[]>();
  const signatures = async (name: string) => {
    if (!sig.has(name)) {
      const rows = await sql(`select coalesce(array_to_json(proargnames)::text, '[]') || '|' || coalesce(array_to_json(proargtypes::regtype[]::text[])::text, '[]') || '|' || proretset
        from pg_proc where proname = '${name.replace(/[^a-z0-9_]/g, "")}' and pronamespace = 'public'::regnamespace`);
      sig.set(name, rows.split("\n").filter(Boolean).map((l) => {
        const [n, t, s] = l.split("|");
        return { names: JSON.parse(n), types: JSON.parse(t), set: s === "true" || s === "t" };
      }));
    }
    return sig.get(name)!;
  };
  const tag = () => "q" + crypto.randomUUID().replace(/-/g, "");
  const lit = (v: unknown, type: string) => {
    if (v === null || v === undefined) return `null::${type}`;
    const t = tag();
    if (type.endsWith("[]")) return `$${t}$${JSON.stringify(v)}$${t}$::jsonb`; // replaced below by a typed array read
    const text = typeof v === "string" && type !== "jsonb" ? v : JSON.stringify(v);
    return `$${t}$${text}$${t}$::${type}`;
  };
  const arrayLit = (v: unknown[], type: string) => {
    const base = type.slice(0, -2), t = tag();
    return `array(select jsonb_array_elements_text($${t}$${JSON.stringify(v)}$${t}$::jsonb)::${base})::${type}`;
  };
  const client = (role: "authenticated" | "service_role", userId: string | null): RpcClient => ({
    async rpc(name, args = {}) {
      try {
        const keys = Object.keys(args as Record<string, unknown>);
        const cand = (await signatures(name)).find((s) => keys.every((k) => s.names.includes(k)) && s.names.length >= keys.length);
        if (!cand) return { data: null, error: { message: `no function ${name}(${keys.join(", ")})` } };
        const params = keys.map((k) => {
          const type = cand.types[cand.names.indexOf(k)];
          const v = (args as any)[k];
          return `${k} => ${type.endsWith("[]") && Array.isArray(v) ? arrayLit(v, type) : lit(v, type)}`;
        }).join(", ");
        const call = `public.${name}(${params})`;
        const select = cand.set ? `select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from ${call} x` : `select to_jsonb(${call})`;
        const claims = userId ? JSON.stringify({ sub: userId, role }) : JSON.stringify({ role });
        const out = await sql(`begin;
set local role ${role};
select set_config('request.jwt.claim.sub', '${userId ?? ""}', true), set_config('request.jwt.claims', $c$${claims}$c$, true) \\g /dev/null
${select};
commit;`);
        return { data: out === "" ? null : JSON.parse(out.split("\n").at(-1)!), error: null };
      } catch (e) {
        return { data: null, error: { message: String((e as Error).message).replace(/^psql:[^E]*ERROR:\s*/, "").split("\n")[0] } };
      }
    },
  });
  const stop = async () => {
    const as = Deno.uid?.() === 0 ? ["runuser", ["-u", "postgres", "--", `${bin}/pg_ctl`]] as const : [`${bin}/pg_ctl`, []] as const;
    await run(as[0], [...as[1], "-D", `${work}/data`, "-m", "immediate", "stop"]);
    await Deno.remove(work, { recursive: true }).catch(() => {});
  };
  return { host: work, port, stop, sql, asPerson: (u) => client("authenticated", u), asService: () => client("service_role", null) };
}
