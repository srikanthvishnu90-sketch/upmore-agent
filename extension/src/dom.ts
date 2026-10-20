// WO-031: the extension's hands on the employer's page (runs in the content script). It reads the form with the engine's
// own in-page reader (page-functions.cjs fnDiscoverFields) and binds it with the engine's own binder (form-bind.ts), fills
// only what the planner answered, and reads every value back the way the page renders it. It never clicks anything but
// the site's own Submit, and only when content.js has the person's approval of the exact payload.
// deno-lint-ignore-file no-explicit-any
import pageFunctions from "../../scripts/career/page-functions.cjs";
import { bindFields } from "../../scripts/career/form-bind.ts";

const { fnDiscoverFields, fnDetectChallenge, fnCaptchaTech } = pageFunctions as any;
export { fnCaptchaTech, fnDetectChallenge };

const W = globalThis as any; // the page's window: DOM types are not in the Deno lib this file is checked with
const doc = () => W.document;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']+/g, " ").replace(/\s+/g, " ").trim();
const visible = (el: any) => !!el && el.getClientRects().length > 0 && W.getComputedStyle(el).visibility !== "hidden";

export interface Form { raw: any[]; bindings: Record<string, any>; schema: any[] }
// The form as the engine reads it (scripts/apply.ts observe): every field, radio and checkbox values from the page.
export function readForm(): Form {
  const raw = fnDiscoverFields(false) as any[];
  const all = Array.from(doc().querySelectorAll("input,select,textarea")) as any[];
  for (const f of raw) {
    const el = all[f.domIndex];
    if (el && ["radio", "checkbox"].includes(el.type)) f.optionValue = el.value;
    f.ref = String(f.domIndex);
  }
  const { bindings, schema } = bindFields(raw);
  return { raw, bindings, schema };
}

// The live element for a discovered selector (an id, a name, or the engine's index fallback).
export function element(selector: string, domIndex?: number): any {
  if (/^upmore-idx-/.test(selector)) {
    return (doc().querySelectorAll("input,select,textarea") as any)[Number(selector.slice(11))] ?? null;
  }
  try {
    return doc().querySelector(selector) ?? (domIndex !== undefined ? doc().querySelectorAll("input,select,textarea")[domIndex] : null);
  } catch {
    return null;
  }
}
const firstEl = (b: any) => element(b.selector);

function setNative(el: any, value: string) {
  const proto = el.tagName === "TEXTAREA" ? W.HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? W.HTMLSelectElement.prototype : W.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
}
function fire(el: any, ...types: string[]) {
  for (const t of types) el.dispatchEvent(new Event(t, { bubbles: true }));
}
const yes = (v: unknown) => /^(true|yes|y|on|checked)\b/i.test(String(v ?? "").trim());

// Ashby's yes/no question: two buttons and a hidden checkbox (tests/fixtures/forms-ci). The button is the answer.
function yesNoButtons(el: any): any[] {
  const box = el.closest && el.closest("[class*='yesno']");
  return box ? Array.from(box.querySelectorAll("button[data-option]")) : [];
}

// A react-select widget's chosen value, as the page renders it (the engine's fnWidgetValue).
function widgetValue(el: any): string | null {
  const root = el.closest("[class*='select__control']") || el.closest("[class*='select__container'], [class*='-container']") || el.parentElement;
  const sv = root && root.querySelector("[class*='select__single-value'], [class*='-singleValue']");
  const t = sv ? String(sv.textContent || "").replace(/\s+/g, " ").trim() : "";
  return t || null;
}
// Type the value, wait for the employer's own option list, pick the option that names it. No option list, no value:
// typed text in a search box is never an answer.
async function driveWidget(el: any, wanted: string): Promise<boolean> {
  el.focus();
  setNative(el, wanted);
  fire(el, "input");
  for (let i = 0; i < 12; i++) {
    await sleep(250);
    const opts = (Array.from(doc().querySelectorAll("[class*='select__option'], [role='option']")) as any[]).filter(visible);
    if (!opts.length) continue;
    const w = norm(wanted);
    const hit = opts.find((o) => norm(o.textContent) === w) ||
      (/^(yes|no)$/.test(w) ? opts.find((o) => norm(o.textContent).split(" ")[0] === w) : null);
    if (!hit) break;
    for (const t of ["mousedown", "mouseup", "click"]) hit.dispatchEvent(new W.MouseEvent(t, { bubbles: true, cancelable: true }));
    await sleep(150);
    return !!widgetValue(el);
  }
  setNative(el, "");
  fire(el, "input");
  el.blur();
  return false;
}

export interface Resume { name: string; type: string; bytes: Uint8Array; sha256: string }
// Fill one bound field with the planner's value. Returns false when the page did not take it.
export async function fill(b: any, value: string, resume: Resume | null): Promise<boolean> {
  const el = firstEl(b);
  if (!el) return false;
  if (b.widget === "react-select") return await driveWidget(el, value);
  if (b.inputType === "file") {
    if (!resume) return false;
    const dt = new W.DataTransfer();
    dt.items.add(new File([resume.bytes as BlobPart], resume.name, { type: resume.type || "application/pdf" }));
    el.files = dt.files;
    fire(el, "input", "change");
    return !!el.files?.length;
  }
  if (b.inputType === "select") {
    const opt = Array.from(el.options as any[]).find((o: any) => o.value === value) ||
      Array.from(el.options as any[]).find((o: any) => norm(o.textContent) === norm(value));
    if (!opt) return false;
    setNative(el, (opt as any).value);
    fire(el, "input", "change");
    return true;
  }
  if (b.inputType === "radio_group" || b.inputType === "checkbox_group") {
    const opt = (b.options || []).find((o: any) => o.value === value) || (b.options || []).find((o: any) => norm(o.label) === norm(value));
    const oel = opt && element(opt.selector);
    if (!oel) return false;
    if (!oel.checked) oel.click();
    if (!oel.checked) {
      oel.checked = true;
      fire(oel, "input", "change");
    }
    return !!oel.checked;
  }
  if (b.inputType === "checkbox") {
    const want = yes(value);
    const buttons = yesNoButtons(el);
    if (buttons.length) {
      const btn = buttons.find((x: any) => x.getAttribute("data-option") === (want ? "yes" : "no"));
      btn?.click();
    }
    if (el.checked !== want) el.click();
    if (el.checked !== want) {
      el.checked = want;
      fire(el, "input", "change");
    }
    return el.checked === want;
  }
  el.focus?.();
  setNative(el, String(value));
  fire(el, "input", "change");
  el.blur?.();
  fire(el, "blur");
  return el.value === String(value) || String(el.value).length > 0;
}

// One field's value as the page renders it, as text the person reads ("" when it carries nothing).
export function readValue(b: any): string {
  const el = firstEl(b);
  if (!el) return "";
  if (b.widget === "react-select") return widgetValue(el) ?? "";
  if (b.inputType === "file") return el.files && el.files[0] ? String(el.files[0].name) : "";
  if (b.inputType === "select") {
    const o = el.options[el.selectedIndex];
    const t = o ? String(o.textContent || "").replace(/\s+/g, " ").trim() : "";
    return !o || o.value === "" || /^select\b/i.test(t) || /^please select/i.test(t) ? "" : t;
  }
  if (b.inputType === "radio_group" || b.inputType === "checkbox_group") {
    const chosen = (b.options || []).filter((o: any) => element(o.selector)?.checked).map((o: any) => o.label);
    return chosen.join(", ");
  }
  if (b.inputType === "checkbox") {
    const pressed = yesNoButtons(el).find((x: any) => x.getAttribute("aria-pressed") === "true");
    if (pressed) return pressed.getAttribute("data-option") === "yes" ? "Yes" : "No";
    return el.checked ? "Yes (checked)" : "";
  }
  return String(el.value ?? "");
}

// The binding a person's own input event belongs to (a trusted event on the field, or inside its widget).
export function fieldNameFor(target: any, form: Form): string | null {
  const byEl = (el: any) => {
    for (const [name, b] of Object.entries(form.bindings) as any[]) {
      if (firstEl(b) === el) return name;
      if ((b.options || []).some((o: any) => element(o.selector) === el)) return name;
    }
    return null;
  };
  let node = target;
  for (let i = 0; i < 7 && node; i++, node = node.parentElement) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName || "")) {
      const n = byEl(node);
      if (n) return n;
    }
    const inside = node.querySelectorAll ? Array.from(node.querySelectorAll("input,select,textarea")) : [];
    const names = new Set(inside.map(byEl).filter(Boolean));
    if (names.size === 1) return [...names][0] as string;
    if (names.size > 1) return null;
  }
  return null;
}

// The site's own Submit: a visible, enabled control whose text says submit.
export function findSubmit(): any {
  const els = (Array.from(doc().querySelectorAll("button, input[type=submit], [role=button]")) as any[]).filter((e) =>
    visible(e) && !e.disabled && e.getAttribute("aria-disabled") !== "true" &&
    /\bsubmit\b/i.test(String(e.innerText || e.textContent || e.value || "")) && !/\b(resume|cv)\b/i.test(String(e.innerText || e.value || ""))
  );
  return els.find((e) => e.type === "submit") || els[0] || null;
}

// What the page shows after the click (scripts/apply.ts outcome()): read by classifyOutcome, the engine's own judge.
export function observe(urlBefore: string, plannedNames: string[]) {
  const d = doc();
  const text = String(d.body?.innerText || "").replace(/\s+/g, " ").slice(0, 6000);
  const formPresent = Array.from(d.querySelectorAll("form") as any[]).some((form: any) =>
    Array.from(form.elements as any[]).some((e: any) => plannedNames.includes(e.name) || plannedNames.includes(e.id) || e.type === "file")
  ) || !!d.querySelector(".ashby-application-form-submit-button, #application-form, .application-form");
  const fields = fnDiscoverFields(false) as any[];
  const errors = (Array.from(d.querySelectorAll("[role=alert],.error,.validation-error,[aria-invalid=true]")) as any[])
    .filter(visible).map((e) => String(e.innerText || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean).slice(0, 12);
  return {
    url_before: urlBefore,
    url_after: String((globalThis as any).location.href),
    form_present_after: formPresent,
    required_empty_after: fields.filter((f) => f.required && !f.valid).length,
    validation_errors: errors,
    captcha: !!fnDetectChallenge(),
    email_code_prompt: /verification code|email.*code|one[- ]time code/i.test(text),
    page_text: text,
  };
}

// The screenshot never shows an identity number or a password: each such field is covered while the picture is taken.
export function maskFields(selectors: string[]): () => void {
  const covers: any[] = [];
  const els = [...selectors.map((s) => element(s)).filter(Boolean), ...Array.from(doc().querySelectorAll("input[type=password]"))];
  for (const el of els as any[]) {
    const r = el.getBoundingClientRect();
    const c = doc().createElement("div");
    c.setAttribute("data-trainee-mask", "1");
    Object.assign(c.style, { position: "fixed", left: r.left + "px", top: r.top + "px", width: Math.max(r.width, 40) + "px",
      height: Math.max(r.height, 16) + "px", background: "#000", zIndex: "2147483647", pointerEvents: "none" });
    doc().documentElement.appendChild(c);
    covers.push(c);
  }
  return () => covers.forEach((c) => c.remove());
}
