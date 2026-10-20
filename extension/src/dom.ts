// WO-031: the extension's hands on the employer's page (runs in the content script). It reads the form with the engine's
// own in-page reader (page-functions.cjs fnDiscoverFields) and binds it with the engine's own binder (form-bind.ts), fills
// only what the planner answered, and reads every value back the way the page renders it. It never clicks anything but
// the site's own Submit, and only when content.js has the person's approval of the exact payload.
// deno-lint-ignore-file no-explicit-any
import pageFunctions from "../../scripts/career/page-functions.cjs";
import { bindFields } from "../../scripts/career/form-bind.ts";
import { placeQuery } from "../../supabase/functions/_shared/answer_options.ts";

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
// WO-042, measured on the live pages from CI (evals/apply/results/live-fill.json): a Greenhouse react-select menu opens
// for a page script only through the widget's own "Toggle flyout" button (typing, ArrowDown or a mousedown on the
// control open nothing). Once open, the employer's own option texts are read and the planner chooses among them
// (`choose`, apply_core chooseWidgetOption): an option is clicked only when the planner names it. A place search with no
// toggle (Greenhouse's location) opens on what is typed into it. Waits poll briefly; nothing waits a fixed 3 seconds.
type Chooser = (labels: string[]) => string | null;
// The employer's own option text the last widget fill clicked ("United States +1"), for the card: the widget itself may
// show less ("+1"), which a person could not check.
let lastChoice: string | null = null;
export function takeWidgetChoice(): string | null {
  const c = lastChoice;
  lastChoice = null;
  return c;
}
const optionEls = () => (Array.from(doc().querySelectorAll("[class*='select__option'], [role='option']")) as any[]).filter(visible);
const optionText = (o: any) => String(o.textContent || "").replace(/\s+/g, " ").trim();
async function until<T>(fn: () => T | null, ms: number, every = 40): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v || Date.now() >= end) return v;
    await sleep(every);
  }
}
function press(el: any) {
  for (const t of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new W.MouseEvent(t, { bubbles: true, cancelable: true, button: 0, view: W }));
}
// Typing the way a keyboard does: keydown, keypress, the character, input, keyup, per character. Lever's place search
// looks up only on a keydown (live run 10) and Greenhouse's location menu opens only for typed keys (live run 12: one
// input event loaded its places but left menuIsOpen false; key by key showed all 10, as trusted typing did).
function typeKeys(el: any, text: string) {
  el.focus();
  setNative(el, "");
  for (const ch of text) {
    const k = { key: ch, bubbles: true, cancelable: true };
    el.dispatchEvent(new W.KeyboardEvent("keydown", k));
    el.dispatchEvent(new W.KeyboardEvent("keypress", k));
    setNative(el, el.value + ch);
    el.dispatchEvent(new W.InputEvent("input", { bubbles: true, inputType: "insertText", data: ch }));
    el.dispatchEvent(new W.KeyboardEvent("keyup", k));
  }
}
function closeMenu(el: any) {
  el.dispatchEvent(new W.KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
  el.blur?.();
}
async function driveWidget(el: any, wanted: string, choose?: Chooser): Promise<boolean> {
  const control = el.closest("[class*='select__control']") || el.closest("[class*='-control']");
  const toggle = control?.querySelector("button[aria-label*='flyout' i], button[aria-label*='toggle' i]");
  const pick = choose ?? ((labels: string[]) => labels.find((l) => norm(l) === norm(wanted)) ?? null);
  if (toggle) press(toggle);
  // A place search: the city typed key by key, the employer's own places read back.
  else typeKeys(el, placeQuery(wanted));
  let opts = await until(() => (optionEls().length ? optionEls() : null), toggle ? 1500 : 2000);
  if (!opts && !toggle) {
    // A place search whose results loaded but whose menu stayed shut: ArrowDown opens a react-select menu.
    el.focus();
    el.dispatchEvent(new W.KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, which: 40, bubbles: true, cancelable: true }));
    opts = await until(() => (optionEls().length ? optionEls() : null), 1500);
  }
  if (!opts) {
    closeMenu(el);
    return false;
  }
  let label = pick(opts.map(optionText));
  // A long list that is searched (a school): the menu filtered by what the planner would answer, then chosen again.
  // Read the filtered list or this widget's own "no options" notice, never the list from before the typing (live run 14: a
  // school not on Greenhouse's list cost 2.5 s on each of 3 forms, waiting for options that could not come). The notice is
  // read inside this select only (react-select's menu is a sibling of its control): live run 16 read the School menu's
  // notice, still on the page, as Discipline's, and Discipline was missed.
  if (!label && toggle && opts.length >= 50) {
    // A list that does not change once 600 ms have passed with no loading notice is final: it is a list that filters in place
    // or ignores the typing (the offline Greenhouse stand-in waited the full 2.4 s on every long list and timed out).
    const before = opts.map(optionText).join("\n");
    const own = control?.parentElement;
    const typedAt = Date.now();
    el.focus();
    setNative(el, String(wanted));
    fire(el, "input");
    opts = await until(() => {
      const now = optionEls();
      if (now.length && now.map(optionText).join("\n") !== before) return now;
      if (own?.querySelector("[class*='menu-notice--no-options']")) return [];
      return now.length && Date.now() - typedAt > 600 && !own?.querySelector("[class*='menu-notice--loading']") ? now : null;
    }, 2400);
    label = opts?.length ? pick(opts.map(optionText)) : null;
  }
  const hit = label ? (opts || []).find((o) => optionText(o) === label) : null;
  if (!hit) {
    if (!toggle) {
      setNative(el, "");
      fire(el, "input");
    }
    closeMenu(el);
    return false;
  }
  press(hit);
  const shown = await until(() => widgetValue(el), 1000);
  if (shown) lastChoice = label;
  return !!shown;
}

// A place search that is not a react-select: Lever's location (input.location-input, its results under .dropdown-results,
// the place kept in a hidden selectedLocation) and Ashby's (an ARIA combobox listing places). WO-042, live run 4: typed
// text alone leaves both empty on the card (11 of 11 missed), since each page keeps only a place picked from its own
// list. So the city is typed, the employer's own places are read, and one is clicked only when the planner names it.
export function isPlaceSearch(el: any): boolean {
  return !!el && el.tagName === "INPUT" && !!(el.classList?.contains("location-input") || el.getAttribute("role") === "combobox" ||
    el.getAttribute("aria-autocomplete") === "list");
}
async function drivePlace(el: any, wanted: string, choose?: Chooser): Promise<boolean> {
  const field = el.closest(".application-field, [class*='fieldEntry'], [class*='inputContainer']") || el.parentElement;
  const hidden = field?.querySelector("input[type='hidden'][name='selectedLocation']") ?? null;
  const listed = () => {
    // Lever's results live inside the field itself, and Lever may keep them at visibility: hidden while another window
    // (the panel) has the focus. Laid out is enough here; the chooser still names the one place it may click. (Live run
    // 9: the lookup itself never starts on this typing; live-fill.cjs's lever_typing measures which typing Lever answers.)
    const lever = (Array.from(field?.querySelectorAll(".dropdown-results > *") ?? []) as any[]).filter((x) => x.getClientRects().length > 0);
    if (lever.length) return lever;
    const id = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    const box = id ? doc().getElementById(id) : null;
    const opts = (Array.from((box ?? doc()).querySelectorAll("[role='option']")) as any[]).filter(visible);
    return opts.length ? opts : null;
  };
  const pick = choose ?? ((labels: string[]) => labels.find((l) => norm(l) === norm(wanted)) ?? null);
  const city = placeQuery(wanted);
  // Lever's retrieveLocations.js (read live in run 10) looks a place up only on a keydown, 500 ms after the last one,
  // reading the text then; input events only show its dropdown. So Lever gets the city key by key, the way that listed
  // its places in run 10 (6 of 6 forms, from the extension's world and the page's). Ashby answers the input event, as
  // in run 5 (5 of 5), and keeps the one typing.
  const keys = !!el.classList?.contains("location-input");
  const type = () => {
    if (keys) return typeKeys(el, city);
    el.focus();
    setNative(el, city);
    el.dispatchEvent(new W.InputEvent("input", { bubbles: true, inputType: "insertText", data: city }));
    el.dispatchEvent(new W.KeyboardEvent("keyup", { key: city.slice(-1), bubbles: true }));
  };
  // The load is awaited, the city typed once (a second typing would restart the lookup), and the list awaited up to
  // 8 s. The wait happens while the person reads the card before; it is never a fixed sleep.
  await until(() => (doc().readyState === "complete" ? true : null), 5000);
  type();
  const opts = await until(listed, 8000);
  const label = opts ? pick(opts.map(optionText)) : null;
  const hit = label ? opts!.find((o) => optionText(o) === label) : null;
  if (!hit) {
    setNative(el, "");
    fire(el, "input");
    closeMenu(el);
    return false;
  }
  press(hit);
  const kept = await until(() => (String(el.value || "").trim() && (!hidden || String(hidden.value || "").trim()) ? true : null), 1500);
  if (kept) lastChoice = label;
  return !!kept;
}

export interface Resume { name: string; type: string; bytes: Uint8Array; sha256: string }
// Fill one bound field with the planner's value. Returns false when the page did not take it.
export async function fill(b: any, value: string, resume: Resume | null, choose?: Chooser): Promise<boolean> {
  const el = firstEl(b);
  if (!el) return false;
  if (b.widget === "react-select") return await driveWidget(el, value, choose);
  if (isPlaceSearch(el)) return await drivePlace(el, value, choose);
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

// What the browser sends for one field beyond its visible text (WO-031 review: "the hash covers what is shown, not what
// is sent"): a select's option value, which radios and checkboxes are checked and their values, and for a file the
// SHA-256 and size of the bytes attached now. A file whose bytes were not hashed yet reads "pending" (a file swapped
// after the review is a new File: it never matches the reviewed one).
const fileSha = new WeakMap<object, string>();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((n) => n.toString(16).padStart(2, "0")).join("");
export async function hashFiles(): Promise<void> {
  for (const el of Array.from(doc().querySelectorAll("input[type=file]")) as any[]) {
    for (const f of Array.from(el.files || []) as any[]) {
      if (!fileSha.has(f)) fileSha.set(f, hex(await W.crypto.subtle.digest("SHA-256", await f.arrayBuffer())));
    }
  }
}
export function readDetail(b: any): string {
  const el = firstEl(b);
  if (!el) return "";
  if (b.inputType === "file") {
    return Array.from(el.files || []).map((f: any) => `${fileSha.get(f) ?? "pending"}:${f.size}:${f.type}`).join(",");
  }
  if (b.inputType === "select") return `value=${el.value}`;
  if (b.inputType === "radio_group" || b.inputType === "checkbox_group") {
    return (b.options || []).map((o: any) => element(o.selector)).filter((x: any) => x?.checked).map((x: any) => `checked=${x.value}`).join(",");
  }
  if (b.inputType === "checkbox") return `checked=${!!el.checked};value=${el.value}`;
  return "";
}
// Read-only fields the page set: sent with the form, so shown on the card and bound to the approval.
export function readFixed(): { name: string; label: string; value: string; selector: string }[] {
  return (fnDiscoverFields(false) as any[]).filter((f) => f.readOnly && !f.disabled && f.inputType !== "file").map((f) => {
    const el = element(f.selector, f.domIndex);
    return { name: f.name || f.id || f.fieldPath || f.selector, label: f.label || f.name, value: String(el?.value ?? ""), selector: f.selector };
  }).filter((f) => f.value);
}
// The error texts visible now: the list taken just before the click is not the employer's answer.
export function visibleErrors(): string[] {
  return (Array.from(doc().querySelectorAll("[role=alert],.error,.validation-error,[aria-invalid=true]")) as any[])
    .filter(visible).map((e) => String(e.innerText || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean).slice(0, 20);
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
  const errors = visibleErrors();
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
