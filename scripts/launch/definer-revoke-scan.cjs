// Static check (launch readiness B1, 2026-10-26): every migration that creates a SECURITY DEFINER function must, in the
// same file, revoke EXECUTE on it from both PUBLIC and anon. Supabase grants EXECUTE on every new public function to anon,
// authenticated and service_role through default privileges, so "revoke ... from public" alone leaves anon able to call
// it over /rest/v1/rpc; the grant must be taken from anon by name. Used by tests/career-definer-revoke.test.cjs.
"use strict";
const fs = require("fs");
const path = require("path");

const strip = (sql) => sql.replace(/--[^\n]*/g, " ");
const bare = (name) => name.replace(/"/g, "").replace(/^public\./i, "").toLowerCase();

// The functions a file creates as SECURITY DEFINER: the header between "create function" and its body's opening quote.
function definersIn(sql) {
  const out = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+((?:"?\w+"?\.)?"?\w+"?)\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    const rest = sql.slice(m.index);
    const body = rest.search(/\bas\s+(\$[a-z_]*\$|')/i);
    const header = body < 0 ? rest.slice(0, 2000) : rest.slice(0, body);
    // "security definer" may also follow the body (plain SQL style: ... $$ language sql security definer;).
    const after = body < 0 ? "" : (() => {
      const tag = rest.slice(body).match(/\bas\s+(\$[a-z_]*\$|')/i)[1];
      const start = body + rest.slice(body).indexOf(tag) + tag.length;
      const end = rest.indexOf(tag, start);
      return end < 0 ? "" : rest.slice(end + tag.length, end + tag.length + 300).split(";")[0];
    })();
    if (/\bsecurity\s+definer\b/i.test(header) || /\bsecurity\s+definer\b/i.test(after)) out.push(bare(m[1]));
  }
  return [...new Set(out)];
}

// The functions a file revokes EXECUTE on from both PUBLIC and anon (one statement or two).
function revokedIn(sql) {
  const from = new Map();
  const re = /revoke\s+[^;]*?\bon\s+(?:function|functions|routine|routines)\s+([^;]*?)\s+from\s+([^;]+);/gi;
  let m;
  while ((m = re.exec(sql))) {
    const roles = m[2].toLowerCase().split(",").map((r) => r.trim().replace(/\s+(cascade|restrict)$/, ""));
    // Each name in the list: name(...) separated by commas outside parentheses.
    let depth = 0, cur = "";
    const names = [];
    for (const ch of m[1]) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { names.push(cur); cur = ""; } else cur += ch;
    }
    names.push(cur);
    for (const n of names) {
      const fn = bare(n.trim().split("(")[0].trim());
      if (!fn) continue;
      const set = from.get(fn) || new Set();
      for (const r of roles) set.add(r);
      from.set(fn, set);
    }
  }
  return from;
}

function scan(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const missing = [];
  for (const f of files) {
    const sql = strip(fs.readFileSync(path.join(dir, f), "utf8"));
    const definers = definersIn(sql);
    if (!definers.length) continue;
    const revoked = revokedIn(sql);
    for (const fn of definers) {
      const roles = revoked.get(fn) || new Set();
      if (!roles.has("public") || !roles.has("anon")) missing.push({ file: f, fn, has: [...roles].sort() });
    }
  }
  return missing;
}

module.exports = { scan, definersIn, revokedIn };
if (require.main === module) {
  const miss = scan(process.argv[2] || path.join(__dirname, "../../supabase/migrations"));
  for (const x of miss) console.log(`${x.file}\t${x.fn}\t${x.has.join(",") || "-"}`);
  console.log(`${miss.length} definer functions without a revoke from both public and anon`);
}
