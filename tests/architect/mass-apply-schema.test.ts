// MASS APPLY (2026-11-01): the form's shape from Greenhouse's public board API, no browser, cached; Lever and Ashby (whose
// public APIs publish no application questions) and any failed read fall back to the browser (null). Measured against the
// fixture board (tests/helpers/ats_world.ts), beside the browser dry run's 11.6 s per posting (flow-mass-apply-telegram).
import assertNode from "node:assert/strict";
import { postingSchema, schemaCache, schemaUrlFor } from "../../supabase/functions/_shared/posting_schema.ts";
import { AUTH_Q, atsWorld, type Posting } from "../helpers/ats_world.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const assert = (v: unknown, m?: string) => assertNode.ok(v, m);

Deno.test("Greenhouse: every question from the board API, once per TTL; Lever/Ashby and failures: the browser", async () => {
  const ps: Posting[] = [
    { family: "greenhouse", board: "acme", id: "5000001", company: "TEST Acme", title: "Frontend Engineering Intern", extraQuestion: true },
    { family: "lever", board: "beta", id: "1c3b0e00-0000-4000-8000-000000000002", company: "TEST Beta", title: "Frontend Engineering Intern" },
    { family: "ashby", board: "gamma", id: "2c3b0e00-0000-4000-8000-000000000003", company: "TEST Gamma", title: "Frontend Engineering Intern" },
  ];
  const w = atsWorld(ps);
  try {
    const api = w.origin("greenhouse");
    eq(schemaUrlFor("https://boards.greenhouse.io/acme/jobs/5000001"), "https://boards-api.greenhouse.io/v1/boards/acme/jobs/5000001?questions=true");
    let gets = 0;
    const f = (u: string, i?: RequestInit) => { gets++; return fetch(u, i); };
    const cache = schemaCache();
    const t0 = performance.now();
    const s = await postingSchema(w.urlOf(ps[0]), { fetch: f, cache, greenhouseApi: api });
    const ms = performance.now() - t0;
    assert(s, "read");
    const names = s!.fields.map((x) => x.name);
    for (const n of ["first_name", "last_name", "email", "phone", "resume", "question_4100001", "question_4100002", "question_4100009"]) assert(names.includes(n), n);
    const auth = s!.fields.find((x) => x.label === AUTH_Q)!;
    eq([auth.required, auth.options.map((o) => o.label)], [true, ["Yes", "No"]]);
    eq(s!.fields.find((x) => x.name === "resume_text")!.required, false, "the paste-instead box is not a second required resume");
    await postingSchema(w.urlOf(ps[0]), { fetch: f, cache, greenhouseApi: api });
    eq(gets, 1, "cached: one GET per posting per TTL");
    eq(await postingSchema(w.urlOf(ps[1]), { fetch: f, cache, greenhouseApi: api }), null);
    eq(await postingSchema(w.urlOf(ps[2]), { fetch: f, cache, greenhouseApi: api }), null);
    eq(await postingSchema(`${api}/acme/jobs/9999999`, { fetch: f, cache, greenhouseApi: api }), null, "a posting the API does not know: the browser");
    console.log(`MEASURED: Greenhouse form schema from the board API in ${ms.toFixed(1)} ms (browser dry run: 11.6 s per posting)`);
  } finally { await w.close(); }
});
