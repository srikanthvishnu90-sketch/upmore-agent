// Terminal apply path. Candidate answers must be explicit confirmed records:
// {user_id, answers:{email:{value,factId,confirmed:true}}, saved:{normalized_label:...}}.
// Default: dry-run. Real submission requires --submit and the exact word yes.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import {
  admitApplication,
  classifyField,
  classifyOutcome,
  normLabel,
  planBatch,
} from "../supabase/functions/_shared/career_apply.ts";
import { hashApplyPayload } from "../supabase/functions/_shared/career_apply_store.ts";
const require = createRequire(import.meta.url);
const { hostAllowed } = require("../packages/domain/150-career-portal-browser.js");
const { createFileTaskStore } = require("../workers/career-browser/store.cjs");
const sha = (b: any) => crypto.createHash("sha256").update(b).digest("hex");
// A confirmed answer for a single checkbox: "Yes" checks it as surely as "true" does.
const yesish = (v: unknown) => /^(true|yes|y|on|checked)$/i.test(String(v ?? "").trim());
// A form asking for an identity number stops before anything is filled: those are the person's to type, never held or
// sent by Trainee (standing rule: no full ID numbers anywhere).
const IDENTITY_NUMBER =
  /social security|\bssn\b|passport (number|no\b)|driver'?s licen[cs]e (number|no\b)|national (id|insurance) number|\btax(payer)? id|\bitin\b|alien (registration )?number|\ba-number\b/i;
// A hidden field the employer's page sets is sent as it is and shown in the review, unless it consents to something on
// the person's behalf: a consent-like name with any value but a decline ("0", "false", "no", empty) stops.
const consentOnBehalf = (name: string, value: string) =>
  /consent|agree|terms|opt.?in|marketing|subscribe|newsletter|privacy/i.test(name) &&
  !/^(0|false|no|off|)$/i.test(String(value).trim());
const fail = (code: string) => Object.assign(Error(code), { code });
// The employer's answer to the one POST: a 2xx, or a redirect (303 to a thank-you page is the usual pattern). A redirect
// off the employer's own site never gets here: the route refuses it and the run stops.
const acknowledged = (status: number) => status >= 200 && status < 400;
// The verification a page runs (reCAPTCHA, including the invisible Enterprise check every captured Greenhouse and
// Ashby form loads; hCaptcha, which every captured Lever form loads; Turnstile) talks to its own provider at load, at
// the person's click and at submit. Those requests are the provider's and carry none of the person's answers, so they
// go through, only on these hosts and paths and never as a page navigation. Trainee never solves a check: the person
// does, in the window (--handoff), or the invisible check runs as it would for them.
const CAPTCHA_PROVIDER =
  /^https:\/\/((www\.)?(google\.com|recaptcha\.net|gstatic\.com)\/recaptcha\/|([a-z0-9-]+\.)*hcaptcha\.com\/|challenges\.cloudflare\.com\/)/;
// The token a passed check leaves in the form. It is the provider's, not an answer: it may be present in the hidden
// fields and the body, it is sent as the page set it, and only its length is recorded.
const CAPTCHA_TOKEN = /^(g-recaptcha-response|h-captcha-response|cf-turnstile-response)$/;
function privateDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o077)) throw fail("PRIVATE_DIRECTORY_REQUIRED");
}
function options(args: string[]) {
  const o: any = { submit: false };
  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    if (k === "--submit") o.submit = true;
    else if (k === "--dry-run") o.dry = true;
    // --handoff: when a verification shows on the page, wait for the person to complete it, then go on from the same
    // page. --headed opens a visible browser for the person's own runs (and implies --handoff).
    else if (k === "--handoff") o.handoff = true;
    else if (k === "--headed") o.headed = o.handoff = true;
    else if (
      ["--url", "--facts", "--resume", "--state-dir", "--evidence-dir"].includes(k) && args[i + 1] &&
      !args[i + 1].startsWith("--")
    ) o[k.slice(2)] = args[++i];
    else throw fail("INVALID_ARGUMENTS");
  }
  if (!o.url || !o.facts || !o.resume || (o.submit && o.dry)) {
    throw fail(
      "USAGE: deno run -A scripts/apply.ts --url <posting> --facts <confirmed-facts.json> --resume <file.pdf> [--submit]",
    );
  }
  return o;
}
function posting(u: URL) {
  const g = hostAllowed(u.href);
  if (
    !g.allowed || u.username || u.password || !["http:", "https:"].includes(u.protocol) ||
    (g.kind !== "local_test" && u.protocol !== "https:")
  ) throw fail("DRIVER_HOST_REFUSED");
  const segments = u.pathname.split("/").filter(Boolean), tenant = u.searchParams.get("for") || segments[0] || "";
  const id = g.atsFamily === "greenhouse"
    ? (u.pathname.match(/\/jobs\/(\d+)/)?.[1] || u.searchParams.get("token"))
    : g.atsFamily === "smartrecruiters"
    ? segments[1]?.match(/^\d+/)?.[0]
    : segments[1];
  if (g.kind !== "local_test" && (!tenant || !id)) throw fail("POSTING_ID_REQUIRED");
  return {
    key: g.kind === "local_test" ? u.origin + u.pathname : `${g.atsFamily}:${tenant}:${id}`,
    employer: g.kind === "local_test" ? u.host : u.host + "/" + tenant,
    local: g.kind === "local_test",
    tenant,
  };
}
function confirmed(input: any, owner: string) {
  const out: any = Object.create(null);
  for (const [key, a] of Object.entries(input || {}) as any) {
    if (a?.user_id && a.user_id !== owner) throw fail("FACT_OWNER_MISMATCH");
    if (
      a?.confirmed === true && typeof a.value === "string" && typeof a.factId === "string" && a.factId.length > 0 &&
      a.factId.length <= 200
    ) out[key] = { value: a.value, factId: a.factId };
  }
  return out;
}
async function answer() {
  const b = new Uint8Array(128);
  let s = "";
  while (s.length < 128) {
    const n = await Deno.stdin.read(b);
    if (n === null) break;
    s += new TextDecoder().decode(b.subarray(0, n));
    if (s.includes("\n")) break;
  }
  return s.split("\n")[0].replace(/\r$/, "");
}
function bind(fields: any[]) {
  const groups = new Map<string, any[]>();
  for (const f of fields) {
    if (f.disabled || f.readOnly) continue;
    const name = f.name;
    if (!name) {
      if (f.required) throw fail("UNNAMED_REQUIRED_FIELD: " + f.label);
      continue;
    }
    groups.set(name, [...(groups.get(name) || []), f]);
  }
  const bindings: any = {}, schema: any[] = [];
  for (const [name, rows] of groups) {
    const f = rows[0], group = rows.length > 1 && rows.every((r) => ["radio", "checkbox"].includes(r.inputType));
    if (rows.length > 1 && !group) throw fail("AMBIGUOUS_FIELD_NAME: " + name);
    const label = group ? (f.groupLabel || f.label) : f.label, type = f.tag === "select" ? "select" : f.inputType;
    const opts = group
      ? rows.map((r) => ({ label: r.label, value: r.optionValue ?? r.label, selector: r.selector, ref: r.ref }))
      : f.options || [];
    schema.push({
      name,
      label: label || name,
      type,
      required: rows.some((r) => r.required),
      options: opts.map((r: any) => ({ label: r.label, value: r.value })),
    });
    bindings[name] = {
      field_id: name,
      inputType: group
        ? (type === "radio" ? "radio_group" : "checkbox_group")
        : type === "file"
        ? "file"
        : type === "select"
        ? "select"
        : type === "checkbox"
        ? "checkbox"
        : "text",
      selector: f.selector,
      elementRefs: rows.map((r) => r.ref),
      options: opts,
      widget: /select__input/.test(f.cls || "") ? "react-select" : null,
      profile_key: classifyField(label, type),
    };
  }
  return { bindings, schema };
}
export async function runApply(args: string[]) {
  const o = options(args),
    u = new URL(o.url),
    target = posting(u),
    _local = (() => {
      // Another state folder would be another once-only record: for a real employer there is exactly one.
      if (o["state-dir"] && !target.local) throw fail("STATE_DIR_LOCAL_ONLY");
      // A hand-off asks the person to complete a check in the browser window; a headless run has no window to use.
      if (o.handoff && !o.headed && !target.local) throw fail("HANDOFF_NEEDS_HEADED");
    })(),
    factsBytes = fs.readFileSync(o.facts),
    factsHash = sha(factsBytes),
    facts = JSON.parse(factsBytes.toString());
  if (typeof facts.user_id !== "string" || !facts.user_id || facts.user_id.length > 160) {
    throw fail("CONFIRMED_FACT_OWNER_REQUIRED");
  }
  if (facts.paused === true) throw fail("ACCOUNT_PAUSED");
  if (facts.erased === true) throw fail("FACTS_ERASED");
  if (
    facts.expires_at !== undefined &&
    (!Number.isFinite(Date.parse(facts.expires_at)) || Date.parse(facts.expires_at) <= Date.now())
  ) throw fail("FACTS_EXPIRED");
  if (!target.local && (facts.synthetic === true || /^TEST[-_]/.test(facts.user_id))) {
    throw fail("SYNTHETIC_FACTS_REQUIRE_LOCAL_FIXTURE");
  }
  if (facts.posting?.url && posting(new URL(facts.posting.url)).key !== target.key) {
    throw fail("POSTING_BINDING_MISMATCH");
  }
  const company = typeof facts.posting?.company === "string" && facts.posting.company.trim()
    ? facts.posting.company
    : (target.local ? target.employer : target.tenant);
  const stateDir = o["state-dir"] || path.join(os.homedir(), ".local", "state", "upmore", "apply");
  privateDir(stateDir);
  const store = createFileTaskStore(stateDir),
    id = sha(facts.user_id + "\n" + target.key).slice(0, 32),
    ownerLock = sha("owner:" + facts.user_id).slice(0, 32);
  const existing = store.get(id);
  // "not_sent": the engine refused the submit before anything left the browser, so the posting may be tried again.
  if (existing && existing.state !== "not_sent") {
    if (existing.user_id !== facts.user_id || existing.job_id !== target.key) throw fail("STATE_BINDING_MISMATCH");
    try {
      const e = JSON.parse(fs.readFileSync(path.join(existing.evidence_path, "evidence.json"), "utf8")),
        obs = e.observation;
      const observed = obs && ["form_present_after", "captcha", "email_code_prompt"].every((k) =>
        typeof obs[k] === "boolean"
      ) && ["url_before", "url_after", "page_text"].every((k) => typeof obs[k] === "string") &&
        Number.isSafeInteger(obs.required_empty_after) && obs.required_empty_after >= 0 &&
        Array.isArray(obs.validation_errors) && obs.validation_errors.every((v: any) => typeof v === "string");
      if (
        e.payload?.user_id === facts.user_id && e.payload?.posting === target.key &&
        e.payload_hash === existing.payload_hash && await hashApplyPayload(e.payload) === existing.approval_hash &&
        e.post?.destination === e.payload.destination && e.post?.mutations === 1 && acknowledged(e.post.status) &&
        observed
      ) {
        const result = classifyOutcome(obs);
        store.withLock(id, () => store.put({ ...store.get(id), state: result.state, result }));
        return { ...result, already_recorded: true, evidence_path: existing.evidence_path };
      }
    } catch { /* Missing/partial evidence cannot create confirmation or permit a resend. */ }
    return {
      state: "unknown_outcome",
      reason: "READBACK_REQUIRED",
      already_recorded: true,
      evidence_path: existing.evidence_path || null,
    };
  }
  const artifact = { filename: path.basename(o.resume), sha256: sha(fs.readFileSync(o.resume)) },
    answers = confirmed(facts.answers, facts.user_id),
    saved = confirmed(facts.saved, facts.user_id);
  answers.resume = { value: artifact.sha256, factId: "approved-local-resume:" + artifact.sha256 };
  const evidenceDir = o["evidence-dir"] || fs.mkdtempSync(path.join(stateDir, "evidence-"));
  privateDir(evidenceDir);
  if (fs.readdirSync(evidenceDir).length) throw fail("EVIDENCE_DIRECTORY_NOT_EMPTY");
  const evidence: any = { posting: target.key, fields: [], readback: {}, payload: null };
  let session: any,
    page: any,
    fenced = false,
    denied = false,
    allowSubmit = false,
    populated = false,
    mutations = 0,
    postStatus = 0,
    destination = "",
    current: any,
    version = "";
  const wire: any = {};
  // The employer's own hidden fields, as the page set them before anything was filled (name -> value).
  let pageFields: Record<string, string> | null = null;
  const write = (result: any) => {
    evidence.result = result;
    const tmp = path.join(evidenceDir, crypto.randomUUID() + ".tmp"), fd = fs.openSync(tmp, "wx", 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(evidence, null, 2) + "\n");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, path.join(evidenceDir, "evidence.json"));
    const dir = fs.openSync(evidenceDir, "r");
    try {
      fs.fsyncSync(dir);
    } finally {
      fs.closeSync(dir);
    }
    return { ...result, evidence_path: evidenceDir };
  };
  const send = (cmd: any) =>
    session.send({
      ...cmd,
      ...(["fill", "readback", "review", "verify_payload", "submit_and_capture"].includes(cmd.type)
        ? { observationVersion: version }
        : {}),
    });
  async function observe() {
    const r = await send({ type: "discover" });
    version = r.observation.version;
    const optionValues = await page.evaluate(() =>
      Array.from((globalThis as any).document.querySelectorAll("input,select,textarea")).map((e: any, i: number) => ({
        domIndex: i,
        name: e.name,
        id: e.id,
        value: ["radio", "checkbox"].includes(e.type) ? e.value : null,
      }))
    );
    for (const f of r.fields) {
      const opt = optionValues.find((a: any) => a.domIndex === f.domIndex && a.name === f.name && a.id === f.id);
      if (opt) f.optionValue = opt.value;
    }
    return { ...bind(r.fields), raw: r.fields, observation: r.observation };
  }
  function expected(field: any, b: any) {
    if (b.inputType === "file") return artifact;
    if (b.inputType === "checkbox") return yesish(field.value);
    const opt = b.options?.find((x: any) => x.value === field.value);
    return ["select", "radio_group"].includes(b.inputType) && opt ? opt.label : field.value;
  }
  function matches(a: any, b: any) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  async function unconfirmed(c: any, planned: any) {
    const all = await send({ type: "readback", bindings: Object.values(c.bindings) });
    for (const [name, value] of Object.entries(all.answers)) {
      const b = c.bindings[name],
        empty = value === false || b?.options?.some((x: any) => x.value === "" && x.label === value);
      if (!Object.hasOwn(planned, name) && !empty) throw fail("UNCONFIRMED_DEFAULT: " + name);
    }
    const hidden = await page.evaluate(() =>
      Array.from((globalThis as any).document.querySelectorAll("input,select,textarea")).filter((e: any) => {
        if (!e.name || e.disabled || e.type === "file" || e.type === "submit" || e.type === "button") return false;
        if (/^(g-recaptcha-response|h-captcha-response|cf-turnstile-response)$/.test(e.name)) return false;
        if (
          e.type === "hidden" &&
          /^(csrf(?:_token)?|authenticity_token|_token|utf8|job_?id|job_board_?id|posting_?id|locale|source|referrer)$/i
            .test(e.name)
        ) return false;
        if (e.type === "hidden" || e.readOnly || !e.getClientRects().length) {
          return ["checkbox", "radio"].includes(e.type) ? e.checked : !!e.value;
        }
        return false;
      }).map((e: any) => ({ name: e.name, value: String(e.value ?? "") }))
    );
    const unexplained = hidden.filter((h: any) =>
      !(pageFields && Object.hasOwn(pageFields, h.name) && pageFields[h.name] === h.value)
    );
    if (unexplained.length) throw fail("UNCONFIRMED_HIDDEN_FIELD: " + unexplained.map((h: any) => h.name).join(", "));
  }
  const formAction = () =>
    page.evaluate(() => {
      const doc = (globalThis as any).document,
        control = Array.from(doc.querySelectorAll("button,input[type=submit]")).find((e: any) =>
          !e.disabled && e.getClientRects().length && /submit/i.test(e.innerText || e.value || "")
        ) as any;
      const form = control?.form || control?.closest("form");
      return form ? { url: form.action, method: form.method } : null;
    });
  // A verification on the page is the person's: they complete it in the browser window, press Enter, and the run
  // re-checks the same page (no reload, which would lose what they did). Three tries, then it stops as needs_user.
  async function handOff(): Promise<boolean> {
    for (let i = 0; i < 3; i++) {
      console.log("A verification is showing in the browser window. Complete it yourself, then press Enter here.");
      await answer();
      if (!(await page.evaluate(helper.detectChallenge))) return true;
    }
    return false;
  }
  const helper = require("./career/portal-browser-helper.cjs");
  if (o.headed) Deno.env.set("UPMORE_BROWSER_HEADED", "1");
  try {
    session = await helper.createSession();
    page = await session.page();
    await page.route("**/*", async (route: any) => {
      const req = route.request(),
        url = new URL(req.url()),
        main = req.isNavigationRequest() && req.frame() === page.mainFrame();
      const same = url.origin === u.origin;
      const sameTenant = target.local || url.pathname.split("/").filter(Boolean)[0] === target.tenant;
      if (main && (!same || !sameTenant)) {
        denied = true;
        await route.abort("blockedbyclient");
        return;
      }
      if (main && !allowSubmit) {
        try {
          if (posting(url).key !== target.key) throw Error();
        } catch {
          denied = true;
          await route.abort("blockedbyclient");
          return;
        }
      }
      // A real provider's requests go out from the browser itself (its own cookies and connection, as for the person).
      if (!main && CAPTCHA_PROVIDER.test(url.href)) {
        await route.continue();
        return;
      }
      // Local fixtures only: a loopback stand-in provider, answered through the route because Chromium refuses a
      // loopback request from a page the route served.
      if (!main && target.local && /^127\./.test(url.hostname) && url.pathname.startsWith("/captcha-provider/")) {
        await route.fulfill({ response: await route.fetch() });
        return;
      }
      if (populated && !same) {
        await route.abort("blockedbyclient");
        return;
      }
      if (!["GET", "HEAD"].includes(req.method())) {
        if (!allowSubmit || req.method() !== "POST" || req.url() !== destination || mutations) {
          await route.abort("blockedbyclient");
          return;
        }
        try {
          const body = req.postDataBuffer(), type = req.headers()["content-type"] || "";
          if (!body || !type.startsWith("multipart/form-data")) throw Error();
          const data = await new Response(new Uint8Array(body), { headers: { "Content-Type": type } }).formData(),
            seen = new Set();
          for (const [name, value] of data.entries()) {
            if (
              !Object.hasOwn(wire, name) && pageFields && Object.hasOwn(pageFields, name) && value === pageFields[name]
            ) {
              if (seen.has(name)) throw Error();
              seen.add(name);
              continue;
            }
            if (!Object.hasOwn(wire, name) && CAPTCHA_TOKEN.test(name)) {
              if (typeof value !== "string" || value.length > 20000 || seen.has(name)) throw Error();
              seen.add(name);
              if (value) evidence.verification_token = { field: name, length: value.length };
              continue;
            }
            if (!Object.hasOwn(wire, name)) {
              if (
                typeof value === "string" &&
                (value === "" ||
                  /^(csrf(?:_token)?|authenticity_token|_token|utf8|job_?id|posting_?id|locale|source|referrer|commit|submit)$/i
                    .test(name))
              ) continue;
              if (typeof value !== "string" && value.size === 0 && value.name === "") continue;
              throw Error();
            }
            if (seen.has(name)) throw Error();
            seen.add(name);
            const want = wire[name];
            if (typeof want === "object") {
              if (
                typeof value === "string" || value.name !== want.filename ||
                sha(new Uint8Array(await value.arrayBuffer())) !== want.sha256
              ) throw Error();
            } else if (value !== want) throw Error();
          }
          for (const name of Object.keys(wire)) if (wire[name] !== null && !seen.has(name)) throw Error();
        } catch {
          evidence.transport_rejection = "APPROVED_BODY_MISMATCH";
          await route.abort("blockedbyclient");
          return;
        }
        mutations++;
      }
      // A request the network refuses (an unreachable image host) is that request's failure, not the run's: it fails in
      // the page as it would for the person. A failed POST after it was counted stays counted (outcome unknown).
      let response;
      try {
        response = await route.fetch({ maxRedirects: 0 });
      } catch {
        await route.abort("failed").catch(() => {});
        return;
      }
      if (req.method() === "POST" && req.url() === destination) postStatus = response.status();
      if (response.status() >= 300 && response.status() < 400) {
        const targetURL = new URL(response.headers().location || "/", req.url());
        let valid = targetURL.origin === u.origin &&
          (target.local || targetURL.pathname.split("/").filter(Boolean)[0] === target.tenant);
        try {
          if (!allowSubmit && posting(targetURL).key !== target.key) valid = false;
        } catch {
          valid = false;
        }
        if (!valid) {
          denied = true;
          await route.fulfill({ status: 403, body: "Off-domain redirect refused" });
          return;
        }
      }
      await route.fulfill({ response });
    });
    const opened = await send({ type: "open", url: u.href });
    if (denied || opened.blockedNavigation) throw fail("HOST_REDIRECT_REFUSED");
    if (opened.captcha && !(o.handoff && await handOff())) return write({ state: "needs_user", reason: "captcha" });
    const history: any = {}, values: any = {}, planned: any = {};
    for (let step = 0; step < 8; step++) {
      current = await observe();
      if (current.raw.some((f: any) => f.inputType === "password")) throw fail("ACCOUNT_LOGIN_REQUIRED");
      const idFields = current.schema.filter((f: any) => IDENTITY_NUMBER.test(f.label || f.name));
      if (idFields.length) {
        return write({
          state: "not_submitted",
          reason: "IDENTITY_NUMBER_REQUESTED",
          fields: idFields.map((f: any) => f.label),
        });
      }
      if (pageFields === null) {
        pageFields = {};
        const found = await page.evaluate(() =>
          Array.from((globalThis as any).document.querySelectorAll("input[type=hidden]")).map((e: any) => ({
            name: e.name,
            value: String(e.value ?? ""),
          }))
        );
        for (const h of found as any[]) {
          if (!h.name || !h.value || CAPTCHA_TOKEN.test(h.name)) continue;
          if (consentOnBehalf(h.name, h.value)) throw fail("UNCONFIRMED_HIDDEN_FIELD: " + h.name);
          pageFields[h.name] = h.value;
        }
      }
      if (current.schema.some((f: any) => /verification code|one[- ]time|email.*code|passcode/i.test(f.label))) {
        return write({ state: "needs_user", reason: "email_code" });
      }
      const p = planBatch({
        userId: facts.user_id,
        postings: [{ job_id: target.key, company: target.employer, title: "", fields: current.schema }],
        answers,
        saved,
        log: [],
        now: Date.now(),
      });
      if (!p.ready.length) {
        for (const n of p.needs) console.log("Required confirmed answer: " + JSON.stringify(n.label));
        return write({ state: "not_submitted", reason: "needs_answers", fields: p.needs.map((n: any) => n.label) });
      }
      const fields = p.ready[0].fields, before = await hashApplyPayload(current.schema);
      for (const f of fields) {
        populated = true;
        const b = current.bindings[f.name];
        if (b.inputType === "file" && classifyField(f.label, "file") !== "resume") {
          throw fail("UNSUPPORTED_FILE_ARTIFACT: " + f.label);
        }
        if (planned[f.name] && planned[f.name].label !== f.label) throw fail("FIELD_MEANING_CHANGED: " + f.name);
        const v = b.inputType === "file" ? artifact : b.inputType === "checkbox" ? yesish(f.value) : f.value;
        const filled = await send({
          type: "fill",
          binding: b,
          value: v,
          ...(b.inputType === "file" ? { filePath: o.resume } : {}),
        });
        if (filled.filled !== true) throw fail("FIELD_DID_NOT_PERSIST: " + f.label);
        planned[f.name] = f;
        values[f.name] = expected(f, b);
        history[f.name] = b;
        wire[f.name] = b.inputType === "file"
          ? artifact
          : b.inputType === "checkbox"
          ? (v ? (current.raw.find((x: any) => x.name === f.name)?.optionValue || "on") : null)
          : f.value;
      }
      current = await observe();
      if (await hashApplyPayload(current.schema) !== before) continue;
      for (const f of fields) history[f.name] = current.bindings[f.name];
      const read = await send({ type: "readback", bindings: Object.values(history) });
      evidence.readback = read.answers;
      for (const [name, value] of Object.entries(values)) {
        if (!matches(read.answers[name], value)) throw fail("READBACK_MISMATCH: " + name);
      }
      await unconfirmed(current, planned);
      const review = await send({
        type: "review",
        knownSelectors: Object.values(current.bindings).flatMap((b: any) =>
          b.options?.length && ["radio_group", "checkbox_group"].includes(b.inputType)
            ? b.options.map((x: any) => x.selector)
            : [b.selector]
        ).filter(Boolean),
      });
      if (denied || review.blockedNavigation) throw fail("HOST_REDIRECT_REFUSED");
      if (review.captcha && !(o.handoff && await handOff())) return write({ state: "needs_user", reason: "captcha" });
      if (review.code) throw fail(review.code);
      if (review.advanced || review.needsFields) continue;
      if (!review.atFinalReview) throw fail("FINAL_REVIEW_NOT_OBSERVED");
      if (
        !Object.values(values).some((v: any) =>
          v && typeof v === "object" && v.filename === artifact.filename && v.sha256 === artifact.sha256
        )
      ) throw fail("RESUME_INPUT_NOT_OBSERVED");
      const action = await formAction();
      if (
        !action || new URL(action.url).origin !== u.origin || action.method.toLowerCase() !== "post" ||
        (!target.local && posting(new URL(action.url)).key !== target.key)
      ) throw fail("SUBMIT_DESTINATION_NOT_BOUND");
      destination = action.url;
      evidence.fields = Object.values(planned);
      evidence.payload = {
        user_id: facts.user_id,
        posting: target.key,
        company,
        destination,
        fields: evidence.fields,
        resume: artifact,
        schema_hash: before,
        facts_sha256: factsHash,
        page_fields: pageFields || {},
        verification: [
          ...new Set(((await page.evaluate(helper.captchaTech)) as string[]).map((t) => t.replace(/-widget$/, ""))),
        ],
      };
      const payloadHash = await hashApplyPayload(evidence.payload);
      evidence.payload_hash = payloadHash;
      evidence.final_url = page.url();
      await send({ type: "screenshot", path: path.join(evidenceDir, "before-review.png") });
      fs.chmodSync(path.join(evidenceDir, "before-review.png"), 0o600);
      for (const f of evidence.fields) {
        console.log(JSON.stringify({ name: f.name, label: f.label, value: f.value, factId: f.factId }));
      }
      const shown = Object.entries(pageFields || {});
      if (shown.length) {
        console.log("Set by the employer's page, sent unchanged:");
        for (const [name, value] of shown) {
          console.log("  " + name + " = " + (value.length > 80 ? value.slice(0, 80) + "..." : value));
        }
      }
      if (evidence.payload.verification.length) {
        console.log(
          "The page runs a verification check (" + evidence.payload.verification.join(", ") +
            "). It adds its own token when you submit; the token carries none of your answers.",
        );
      }
      console.log("Resume SHA-256: " + artifact.sha256);
      console.log("Destination: " + destination);
      console.log("Payload SHA-256: " + payloadHash);
      if (!o.submit) return write({ state: "not_submitted", reason: "dry_run" });
      console.log(`Submit this application to ${target.employer}? (yes/no)`);
      if (await answer() !== "yes") return write({ state: "not_submitted", reason: "user_declined" });
      if (sha(fs.readFileSync(o.facts)) !== factsHash) throw fail("FACTS_CHANGED");
      if (sha(fs.readFileSync(o.resume)) !== artifact.sha256) throw fail("RESUME_SHA_MISMATCH");
      const fresh = await observe();
      if (await hashApplyPayload(fresh.schema) !== before) throw fail("FORM_SCHEMA_CHANGED");
      await unconfirmed(fresh, planned);
      const actionNow = await formAction();
      if (!actionNow || actionNow.url !== destination || actionNow.method.toLowerCase() !== "post") {
        throw fail("SUBMIT_DESTINATION_CHANGED");
      }
      for (const name of Object.keys(fresh.bindings)) {
        if (Object.hasOwn(history, name)) history[name] = fresh.bindings[name];
      }
      const verified = await send({ type: "verify_payload", bindings: Object.values(history), payload: values });
      if (!verified.matches) throw fail("PAYLOAD_CHANGED_BEFORE_CLICK");
      store.withLock(ownerLock, () => {
        const prior = store.get(id);
        if (prior && prior.state !== "not_sent") throw fail("duplicate_job");
        const log = store.list().map((key: string) => store.get(key)).filter((j: any) => j && j.state !== "not_sent")
          .map((j: any) => ({
            user_id: j.user_id,
            job_id: j.job_id,
            company: j.company,
            at: j.at,
            state: j.state === "unknown_outcome" ? "submitting" : j.state,
          }));
        const admission = admitApplication(log, {
          user_id: facts.user_id,
          job_id: target.key,
          company,
          payload_hash: payloadHash,
          approval_hash: payloadHash,
        }, Date.now());
        if (!admission.ok) throw fail(admission.reason!);
        store.put({
          id,
          user_id: facts.user_id,
          job_id: target.key,
          company,
          at: Date.now(),
          state: "submitting",
          payload_hash: payloadHash,
          approval_hash: payloadHash,
          evidence_path: evidenceDir,
        });
      });
      fenced = true;
      allowSubmit = true;
      let cap = await send({
        type: "submit_and_capture",
        screenshotPath: path.join(evidenceDir, "after-submit.png"),
      });
      // An invisible check can turn into a challenge at the click. The send waits for the person: they complete it in
      // the window, the page sends the approved form itself, and the one-POST and body checks above still hold. Nothing
      // is clicked again by Trainee.
      if (cap.clicked && cap.captcha && mutations === 0 && o.handoff && !denied && !cap.blockedNavigation) {
        evidence.handoff_at_submit = true;
        if (await handOff()) {
          for (let i = 0; i < 60 && mutations === 0; i++) await new Promise((r) => setTimeout(r, 500));
          await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(2500);
          await page.screenshot({ path: path.join(evidenceDir, "after-submit.png"), fullPage: true }).catch(() => {});
          cap = {
            clicked: true,
            captcha: await page.evaluate(helper.detectChallenge),
            finalUrl: page.url(),
            text: await page.evaluate(() =>
              String((globalThis as any).document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 6000)
            ),
          };
        }
      }
      allowSubmit = false;
      evidence.post = { mutations, status: postStatus, destination };
      if (denied || cap.blockedNavigation) throw fail("HOST_REDIRECT_REFUSED");
      // A challenge at the click that nobody completed: nothing left the browser, and the reason says what is needed.
      if (cap.captcha && mutations === 0) throw fail("CAPTCHA_AT_SUBMIT");
      if (!cap.clicked) throw fail("SUBMIT_EFFECT_UNCERTAIN");
      if (mutations !== 1 || !acknowledged(postStatus)) throw fail("SUBMIT_ACKNOWLEDGEMENT_UNCERTAIN");
      const after = await observe(),
        text = String(cap.text || "").slice(0, 4000),
        formPresent = await page.evaluate(
          (names: string[]) =>
            Array.from((globalThis as any).document.querySelectorAll("form")).some((form: any) =>
              Array.from(form.elements).some((e: any) => names.includes(e.name) || e.type === "file")
            ),
          Object.keys(planned),
        );
      const obs = {
        url_before: u.href,
        url_after: cap.finalUrl || page.url(),
        form_present_after: formPresent,
        required_empty_after: after.raw.filter((f: any) => f.required && !f.valid).length,
        validation_errors: after.observation.errors || [],
        captcha: !!cap.captcha,
        email_code_prompt: /verification code|email.*code|one[- ]time code/i.test(text) ||
          after.raw.some((f: any) =>
            /(verification|security|email|one[- _]time).*code|\botp\b|passcode|^code$/i.test(f.label + " " + f.name)
          ),
        page_text: text,
      };
      evidence.observation = obs;
      const result = classifyOutcome(obs), recorded = write(result);
      store.withLock(id, () => {
        const j = store.get(id);
        store.put({ ...j, state: result.state, result });
      });
      return recorded;
    }
    throw fail("FORM_DID_NOT_SETTLE");
  } catch (e: any) {
    // Fenced and nothing left the browser (the one POST was refused or never made): not sent, and the posting may be
    // tried again. Fenced and the POST went out: unknown until the employer's record says otherwise; never resent.
    const sent = fenced && mutations > 0;
    const notSentReason = evidence.transport_rejection || (denied ? "HOST_REDIRECT_REFUSED" : e.code || "DRIVER_ERROR");
    const result = {
      state: sent ? "unknown_outcome" : "not_submitted",
      reason: sent ? "READBACK_REQUIRED" : notSentReason,
    };
    if (fenced) {
      store.withLock(id, () => {
        const j = store.get(id);
        store.put({ ...j, state: sent ? "unknown_outcome" : "not_sent", reason: result.reason });
      });
    }
    return write(result);
  } finally {
    if (session) await session.close().catch(() => {});
  }
}
if (import.meta.main) {
  try {
    console.log("RESULT " + JSON.stringify(await runApply(Deno.args)));
  } catch (e: any) {
    console.log("RESULT " + JSON.stringify({ state: "not_submitted", reason: e.code || "INVALID_APPLY_INPUT" }));
    Deno.exitCode = 1;
  }
}
