// A closed posting is labelled, never removed (reqs Q558, Q635, Q661). On the jobs page a posting the employer closed (or whose
// deadline to apply has passed) keeps its row: a "Closed" label where Apply was, the title struck through and muted, the day it
// closed in the person's own day, and no Apply, no "Apply to all". The text twin says the same. Measured in a real Chromium at phone
// width, light and dark (no sideways scroll, taps >= 44 px, AA contrast, the strike visible). Memory stores, a fixed clock.
import assertNode from "node:assert/strict";
import { createRequire } from "node:module";
import { jobViewOf, refOf } from "../../supabase/functions/_shared/telegram_jobs.ts";
import { handleFile, type FileStore } from "../../supabase/functions/trainee-file/handler.ts";
import { signedIn } from "./file-session-fakes.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ok = (v: unknown, m?: string) => assertNode.ok(v, m);
const U = "11111111-1111-4111-8111-111111111111", LIST = "0123456789", NOW = Date.parse("2026-11-01T15:00:00Z");
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const CI = Deno.env.get("CI") === "true";

const hit = (n: number, extra: Record<string, unknown> = {}) => ({ job_id: `greenhouse:co:${n}`, company: ["Acme", "Globex", "Initech"][n - 1], title: `Data Analyst ${n}`, location: "Austin, TX", url: `https://boards.greenhouse.io/co/jobs/${n}`, pay: "$90k", ...extra });
const ROWS: Record<string, any> = {
  "greenhouse:co:1": { job_id: "greenhouse:co:1", provider: "greenhouse", description: "<p>Build dashboards.</p>", posted_at: "2026-10-20T12:00:00Z", closed_at: "2026-10-31T05:30:00Z" },
  "greenhouse:co:2": { job_id: "greenhouse:co:2", provider: "greenhouse", description: "<p>Own the pricing report.</p>", posted_at: "2026-10-28T12:00:00Z", closed_at: null },
  "greenhouse:co:3": { job_id: "greenhouse:co:3", provider: "greenhouse", description: "<p>Model churn.</p>", posted_at: "2026-10-01T12:00:00Z", closed_at: null, deadline: "2026-10-25T23:59:00-05:00" },
};

async function page(tz: string | null, o: { text?: boolean } = {}) {
  const A = signedIn();
  const kv = new Map<string, any>();
  const store = {
    async remember(u: string, r: string, j: any, s: string) { kv.set(`${u}|job|${r}`, { job: j, shownAs: s }); }, async recall(u: string, r: string) { return kv.get(`${u}|job|${r}`) ?? null; },
    async rememberList(u: string, id: string, refs: string[]) { kv.set(`${u}|list|${id}`, refs); }, async recallList(u: string, id: string) { return kv.get(`${u}|list|${id}`) ?? null; },
    async postings(ids: string[]) { return ids.map((id) => ROWS[id]); }, async save() { return "saved"; }, async applied() { return false; },
    async prepared(_u: string, jobId: string) { return { id: `p-${jobId}`, job_id: jobId, company: "x", url: "https://boards.greenhouse.io/co/jobs/1", payload: { destination: `https://boards.greenhouse.io/co/jobs/${jobId.slice(-1)}`, fields: [] }, payload_hash: "ab".repeat(32), card_lines: [], state: "ready" }; },
    async want() { return { result: "queued" }; }, async appRow() { return null; }, async wanted() { return false; },
  } as unknown as FileStore;
  const refs: string[] = [];
  for (const n of [1, 2, 3]) { const v = jobViewOf(hit(n), ROWS[`greenhouse:co:${n}`]), r = await refOf(U, v.job_id); refs.push(r); await store.remember(U, r, v, "text"); }
  await store.rememberList(U, LIST, refs);
  const env = { get: (k: string) => ({ TRAINEE_FILE_LINK_SECRET: "file-link-secret-0123456789-abcdef", TRAINEE_FILE_BASE_URL: "https://trainee.example/file" } as Record<string, string>)[k] };
  const t = await A.tok(U, LIST, NOW);
  const url = `https://trainee.example/file${o.text ? "?format=text" : ""}`;
  const res = await handleFile(new Request(url, { headers: { cookie: `tf_s=${t}` } }), { store, now: () => NOW, env, ...A.deps, timeZone: async () => tz });
  return { status: res.status, body: await res.text(), refs };
}
const rowOf = (html: string, company: string) => { const m = html.split(/<li class="row/).find((s) => s.includes(`<span class="name">${company}</span>`)); return m ? `<li class="row${m}` : ""; };

Deno.test("the jobs page keeps a closed posting: labelled Closed, struck, the closed day in the person's day, no Apply; open rows unchanged", async () => {
  const { status, body } = await page("America/Los_Angeles");
  eq(status, 200);
  const acme = rowOf(body, "Acme"), globex = rowOf(body, "Globex"), initech = rowOf(body, "Initech");
  ok(acme && globex && initech, "all three rows are on the page (a closed one is never removed)");
  ok(/^<li class="row closed"/.test(acme), "the closed row is marked closed");
  ok(/<span class="chip closed" role="status">Closed<\/span>/.test(acme), "a Closed label where Apply was");
  ok(acme.includes("Closed Oct 30. Nothing can be sent to it"), `closed on Oct 30 in Los Angeles (05:30 UTC Oct 31 is 10:30 PM there): ${acme.match(/<p class="note">[^<]*/)?.[0]}`);
  ok(!/class="apply"/.test(acme), "no Apply on a closed row");
  ok(/^<li class="row closed"/.test(initech) && initech.includes("Closed: the deadline to apply has passed"), "a passed deadline is closed too");
  ok(/^<li class="row"/.test(globex) && /class="apply"/.test(globex) && !/chip closed/.test(globex), "an open row still offers Apply");
  ok(!/Apply to all/.test(body), "a closed row is never in Apply to all (one open row left)");
  ok(/\.row\.closed \.role\{text-decoration:line-through\}/.test(body));
});

Deno.test("the text twin says a closed posting is closed and offers nothing for it; no zone known: Chicago's day", async () => {
  const html = await page(null);
  ok(rowOf(html.body, "Acme").includes("Closed Oct 31."), "no zone known: Chicago's day (12:30 AM Oct 31)");
  const t = await page("America/Chicago", { text: true });
  eq(t.status, 200);
  const acme = t.body.slice(t.body.indexOf("Acme - "), t.body.indexOf("Globex - "));
  ok(acme.includes("Closed Oct 31. Nothing can be sent to it.") && acme.includes("Apply: not offered: the posting is closed"), acme);
  ok(t.body.includes("Closed: the deadline to apply has passed. Nothing can be sent to it."), t.body);
});

// ---------------------------------------------------------------- Chromium at phone width, light and dark
function playwright(): any {
  const req = createRequire(import.meta.url);
  for (const p of [Deno.env.get("UPMORE_PLAYWRIGHT_PATH"), `${ROOT}/tools/node_modules/playwright`]) { if (!p) continue; try { return req(p); } catch { /* next */ } }
  return null;
}
const MEASURE = `(() => {
  const rgb = (s) => { const m = /rgba?\\(([^)]+)\\)/.exec(s); const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
  const ground = (el) => { for (let e = el; e; e = e.parentElement) { const b = rgb(getComputedStyle(e).backgroundColor); if (b.a > 0.5) return b.c; } return [255,255,255]; };
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  const row = document.querySelector("li.row.closed");
  const texts = [...row.querySelectorAll("*")].filter((el) => vis(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((el) => ({ el: el.className + " '" + el.textContent.trim().slice(0, 30) + "'", color: rgb(getComputedStyle(el).color).c, ground: ground(el), size: parseFloat(getComputedStyle(el).fontSize) }));
  const taps = [...document.querySelectorAll("a[href],button,summary")].filter(vis).map((el) => ({ el: el.textContent.trim().slice(0, 30), h: el.getBoundingClientRect().height }));
  const chip = row.querySelector(".chip.closed");
  return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, texts, taps,
    strike: getComputedStyle(row.querySelector(".role")).textDecorationLine, chip: chip && vis(chip) ? chip.textContent.trim() : null,
    applyInClosed: row.querySelectorAll(".apply").length, applyElsewhere: document.querySelectorAll("li.row:not(.closed) .apply").length };
})()`;
const lum = (c: number[]) => { const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

Deno.test({ name: "Chromium, 320 and 390 px, light and dark: the closed row is legible (AA), struck, labelled, and the page never scrolls sideways", sanitizeResources: false, sanitizeOps: false, async fn() {
  const pw = playwright();
  if (!pw) { if (CI) throw Error("the closed-row check needs the gate's Playwright browser in CI"); console.log("NOT_RUN locally: no Playwright"); return; }
  const { body } = await page("America/Chicago");
  const chrome = Deno.env.get("UPMORE_CHROMIUM_PATH");
  const browser = await pw.chromium.launch({ headless: true, ...(Deno.uid?.() === 0 && !CI ? { args: ["--no-sandbox"] } : { chromiumSandbox: true }), ...(chrome ? { executablePath: chrome } : {}) });
  try {
    for (const scheme of ["light", "dark"] as const) for (const width of [320, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: scheme, deviceScaleFactor: 1 });
      await ctx.route("**/*", (r: any) => r.abort());
      const pg = await ctx.newPage();
      await pg.setContent(body, { waitUntil: "load" });
      const m = await pg.evaluate(MEASURE);
      const where = `${scheme} ${width}px`, bad: string[] = [];
      if (m.scrollW > m.innerW) bad.push(`scrolls sideways ${m.scrollW} > ${m.innerW}`);
      for (const x of m.taps.filter((x: any) => x.h < 44)) bad.push(`tap under 44 px: ${x.el} ${x.h}`);
      for (const x of m.texts.filter((x: any) => ratio(x.color, x.ground) < 4.5)) bad.push(`under AA: ${x.el} ${ratio(x.color, x.ground).toFixed(2)}:1`);
      for (const x of m.texts.filter((x: any) => x.size < 14)) bad.push(`under 14 px: ${x.el}`);
      if (m.strike !== "line-through") bad.push(`title not struck: ${m.strike}`);
      if (m.chip !== "Closed") bad.push(`label: ${m.chip}`);
      if (m.applyInClosed !== 0) bad.push("an Apply in the closed row");
      if (m.applyElsewhere !== 1) bad.push(`open row Apply count ${m.applyElsewhere}`);
      eq(bad, [], where);
      await ctx.close();
    }
  } finally { await browser.close(); }
} });
