// WO-031: the extension's hands on the employer's page (runs in the content script). It reads the form with the engine's
// own in-page reader (page-functions.cjs fnDiscoverFields) and binds it with the engine's own binder (form-bind.ts), fills
// only what the planner answered, and reads every value back the way the page renders it. It never clicks anything but
// the site's own Submit, and only when content.js has the person's approval of the exact payload.
// deno-lint-ignore-file no-explicit-any
import pageFunctions from "../../scripts/career/page-functions.cjs";
import { bindFields } from "../../scripts/career/form-bind.ts";
import { placeQuery } from "../../supabase/functions/_shared/answer_options.ts";

const { fnDiscoverFields, fnDetectChallenge, fnCaptchaTech, fnPostingLocation } = pageFunctions as any;
export { fnCaptchaTech, fnDetectChallenge, fnPostingLocation };

const W = globalThis as any; // the page's window: DOM types are not in the Deno lib this file is checked with
const doc = () => W.document;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']+/g, " ").replace(/\s+/g, " ").trim();
const visible = (el: any) => !!el && el.getClientRects().length > 0 && W.getComputedStyle(el).visibility !== "hidden";

export interface Form { raw: any[]; bindings: Record<string, any>; schema: any[] }
// The form as the engine reads it (scripts/apply.ts observe): every field, radio and checkbox values from the page.
// WO-048: a Workday application step is read by its own reader (readWorkday below); a Workday sign-in page is never read.
export function readForm(): Form {
  // An account page is never read, with Workday's markers or without them (an email-first sign-in has none; round 2).
  if (workdayAccountPage()) return { raw: [], bindings: {}, schema: [] };
  if (isWorkdayFlow()) return readWorkday();
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
  if (/^wd:/.test(selector)) {
    const el = wdEls.get(selector);
    return el && el.isConnected ? el : null;
  }
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
    // This select's own menu, found through the input's own listbox (aria-controls), else beside the control. Live run 17:
    // the notice was not under the control's parent on Greenhouse, so School waited the full 2.4 s again.
    const before = opts.map(optionText).join("\n");
    const menu = () => {
      const id = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
      const box = id ? doc().getElementById(id) : null;
      // The menu itself (a class ending in "__menu" or "-menu"), not its list ("select__menu-list"): the notice may sit beside it.
      let m: any = box;
      while (m && !Array.from(m.classList ?? []).some((c: any) => /(__|-)menu$/.test(String(c)))) m = m.parentElement;
      return m ?? box ?? control?.parentElement ?? null;
    };
    const own = { querySelector: (s: string) => menu()?.querySelector(s) ?? null };
    const typedAt = Date.now();
    el.focus();
    setNative(el, String(wanted));
    fire(el, "input");
    opts = await until(() => {
      const now = optionEls();
      if (now.length && now.map(optionText).join("\n") !== before) return now;
      // "No options" counts only from a second after the typing: a list that searches remotely first shows "no options"
      // for what it already had, then its matches (live run 18: Discipline was missed when the first notice ended the wait).
      if (own?.querySelector("[class*='menu-notice--no-options']") && Date.now() - typedAt > 1000) return [];
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
  if (/^wd-/.test(String(b.widget || ""))) return await fillWorkday(b, el, value, resume);
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
  if (b.widget === "wd-list") return `value=${wdHiddenValue(el)}`;
  if (b.widget === "wd-prompt" || b.widget === "wd-date") return "";
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
  if (/^wd-/.test(String(b.widget || ""))) return readWorkdayValue(b, el);
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
    // WO-048: a Workday field's element may be its listbox button or its date group, not an input.
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName || "") || (wdEls.size && wdOwned.has(node))) {
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
  ) || !!d.querySelector(".ashby-application-form-submit-button, #application-form, .application-form") ||
    // WO-048: Workday's review step has no <form>; it is still there until Workday thanks the person, while its review or
    // its own Submit shows.
    (isWorkdayFlow() && !d.querySelector('[data-automation-id="thankYouMessage"]') &&
      (!!d.querySelector('[data-automation-id="applyFlowReviewPage"]') || /^submit\b/i.test(wdText(workdayNextButton()?.textContent))));
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

// WO-096: the page's one visible code box after the approved submit (its label, name, placeholder or one-time-code
// autocomplete names a verification/security/email code) and the button that sends it (a submit, verify, confirm or
// continue button in the same form). Exactly one box, or nothing: split one-character boxes and two boxes are the
// person's. The box is marked so the proof's picture covers it.
const CODE_NAMED = /(verification|security|email|one[- _]?time|confirmation)[\s_-]*code|\botp\b|passcode|^code$/i;
export const CODE_BOX = "[data-trainee-code-box]";
export function findCodeBox(): { box: any; button: any } | null {
  const d = doc();
  const words = (e: any) => {
    const label = e.id ? d.querySelector(`label[for="${String(e.id).replace(/"/g, "")}"]`) : null;
    return [label?.innerText, e.getAttribute("aria-label"), e.name, e.id, e.placeholder].filter(Boolean).join(" ").trim();
  };
  const boxes = (Array.from(d.querySelectorAll("input")) as any[]).filter((e) =>
    !e.disabled && !e.readOnly && visible(e) && ["text", "tel", "number", "search"].includes(e.type) &&
    (e.autocomplete === "one-time-code" || CODE_NAMED.test(words(e)) || CODE_NAMED.test(String(e.name || "")))
  );
  if (boxes.length !== 1 || (boxes[0].maxLength > 0 && boxes[0].maxLength < 4)) return null;
  const box = boxes[0];
  const buttons = (Array.from((box.form || d).querySelectorAll("button, input[type=submit]")) as any[]).filter((b) =>
    !b.disabled && visible(b) && /submit|verify|confirm|continue/i.test(String(b.innerText || b.value || ""))
  );
  const button = buttons.find((b) => b.type === "submit") || buttons[0];
  return button ? { box, button } : null;
}
// Types the code the person's own mail holds into that box and presses its button. The code is not kept: it goes into
// the page only. Returns whether it was typed and pressed.
export function typeCode(code: string): boolean {
  const found = findCodeBox();
  if (!found || typeof code !== "string" || !code) return false;
  found.box.setAttribute("data-trainee-code-box", "1");
  found.box.focus();
  setNative(found.box, code);
  fire(found.box, "input", "change");
  found.button.click();
  return true;
}

// The screenshot never shows an identity number or a password: each such field is covered while the picture is taken.
export function maskFields(selectors: string[]): () => void {
  const covers: any[] = [];
  // WO-096: a code box Trainee typed an emailed code into is covered too.
  const els = [...selectors.map((s) => element(s)).filter(Boolean), ...Array.from(doc().querySelectorAll("input[type=password], " + CODE_BOX))];
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

// ------------------------------------------------------------------------------------------------ Workday (WO-048)
// A Workday application step, read by Workday's own markers (data-automation-id): each formField-* wrapper is one field
// (its label or legend, its required star, its control: a text box, a textarea, a listbox button, a search prompt with
// pills, radios, one checkbox or a group, month/day/year spinbuttons, a file upload). A field inside a repeating
// section's row (work experience, education, languages) carries its row and part; the planner answers it from the
// person's own list. Option lists exist only once a listbox or prompt opens: they are read once per Fill by opening it
// (loadWorkdayOptions) and the planner chooses among them, exactly as for any select. Nothing here decides an answer.
// Sources for every marker: tests/fixtures/workday/sources.md (several are ASSUMED there; real Workday is NOT_RUN).
const WD_HOST = /(^|\.)(myworkdayjobs\.com|myworkdaysite\.com|myworkday\.com)$/i;
const wdEls = new Map<string, any>(); // "wd:<name>" (and "wd:<name>#<i>" for an option) -> the live element
const wdOwned = new WeakSet<object>(); // elements that are a Workday field's own element (for the person's edits)
const wdOptions = new Map<string, string[]>(); // field name -> the option texts its list showed when opened
const wdPaths = new Map<string, Map<string, string[]>>(); // prompt field name -> option label -> the categories above its leaf
// A leaf under categories is offered to the planner with its path ("Website > Litware Careers Website"): the category says
// what the leaf means, and two leaves of one name under two categories stay two options (WO-048 round 2).
const PATH_SEP = " > ";
const leafOf = (label: string) => label.split(PATH_SEP).pop()!;
const wdText = (t: unknown) => String(t ?? "").replace(/[*✱]/g, "").replace(/\s+/g, " ").trim();
const aidOf = (el: any) => String(el?.getAttribute?.("data-automation-id") ?? "");
const onWorkday = () => {
  try {
    return WD_HOST.test(String(W.location.hostname));
  } catch {
    return false;
  }
};
const shown = (el: any) => !!el && visible(el);

// A Workday application step (or its sign-in): Workday's own wrappers are on the page.
export function isWorkdayFlow(): boolean {
  if (!onWorkday()) return false;
  return !!doc().querySelector('[data-automation-id^="formField-"], [data-automation-id="applyFlowPage"], [data-automation-id="applyFlowReviewPage"], ' +
    '[data-automation-id="progressBar"], [data-automation-id="pageFooterNextButton"], [data-automation-id="signInContent"], [data-automation-id="createAccountContent"]');
}

// The person's own account: a password box, Workday's sign-in or create-account view, a verify-password box or an
// emailed code. Such a page is never read, filled or clicked by Trainee (WO-048 rule 1).
const ACCOUNT_IDS = ["signInContent", "createAccountContent", "signInSubmitButton", "createAccountSubmitButton", "verificationCode", "verifyPassword",
  "password", "createAccountCheckbox", "signInPassword", "emailVerificationCode"];
export function workdayAccountPage(): boolean {
  if (!onWorkday()) return false;
  const d = doc();
  if ((Array.from(d.querySelectorAll("input[type=password]")) as any[]).some(shown)) return true;
  if (ACCOUNT_IDS.some((id) => (Array.from(d.querySelectorAll(`[data-automation-id="${id}"]`)) as any[]).some(shown))) return true;
  if (emailFirstSignIn()) return true;
  const step = d.querySelector('[data-automation-id="applyFlowPage"], [data-automation-id="applyFlowReviewPage"]');
  if (step) return false;
  const buttons = (Array.from(d.querySelectorAll("button, [role=button], [data-automation-id=click_filter]")) as any[]).filter(shown);
  if (buttons.some((b) => /^(sign in|create account|verify|verify password|send code|resend code)$/i.test(wdText(b.getAttribute("aria-label") || b.textContent)))) return true;
  return /\b(verification|one[- ]time|security) code\b/i.test(String(d.body?.innerText || ""));
}

// WO-048 round 2: an email-first sign-in (the account's email and "Next"; the password comes on the next view) shows no
// password box and none of Workday's account markers. It is one: the only box a person can type in is an email or user
// name box, nothing else on the page asks anything, a button says Next / Continue / Sign In, and the page speaks of
// signing in or an account. Never filled, never clicked.
const ROBOT = /\brobots?\b|\bhoneypot\b|do not enter if you'?re human/i;
function emailFirstSignIn(): boolean {
  const d = doc();
  const boxes = (Array.from(d.querySelectorAll("input:not([type=hidden]), textarea, select, button[aria-haspopup=listbox], [role=combobox], [role=spinbutton]")) as any[])
    .filter((el) => shown(el) && !["submit", "button", "reset", "image"].includes(String(el.type || "").toLowerCase()) && aidOf(el) !== "beecatcher" &&
      !(el.tabIndex === -1 && ROBOT.test(wdText(el.closest("div, p, label")?.textContent))));
  if (boxes.length !== 1) return false;
  const box = boxes[0];
  if (box.tagName !== "INPUT" || !["text", "email", ""].includes(String(box.getAttribute("type") || "").toLowerCase())) return false;
  const lab = box.id ? d.querySelector(`label[for="${cssEsc(box.id)}"]`) : box.closest("label");
  const about = [box.type, aidOf(box), box.getAttribute("autocomplete"), box.name, box.id, box.getAttribute("aria-label"), box.placeholder, lab?.textContent].join(" ");
  if (box.type !== "email" && !/e-?mail|user ?name|\blogin\b|sign[- ]?in/i.test(about)) return false;
  const buttons = (Array.from(d.querySelectorAll("button, [role=button], input[type=submit]")) as any[]).filter(shown);
  if (!buttons.some((b) => /^(next|continue|sign in|log in|sign in with email|continue with email)$/i.test(wdText(b.getAttribute("aria-label") || b.value || b.textContent)))) return false;
  return /\b(sign[- ]?in|log[- ]?in|account)\b/i.test(String(d.body?.innerText || d.body?.textContent || ""));
}

// The step the page shows: its title in Workday's progress bar, and whether its footer saves a draft or submits.
export function workdayNextButton(): any {
  const els = (Array.from(doc().querySelectorAll('[data-automation-id="pageFooterNextButton"], [data-automation-id="bottom-navigation-next-button"]')) as any[]).filter(shown);
  return els[0] ?? null;
}
export function workdayStep(): { title: string; kind: "page" | "review" | "none"; button: string } {
  const d = doc();
  const active = d.querySelector('[data-automation-id="progressBarActiveStep"]');
  let title = active ? wdText((active.querySelector("label") ?? active).textContent).replace(/^(current )?step \d+ of \d+\s*/i, "") : "";
  if (!title) title = wdText(d.querySelector('[data-automation-id="applyFlowPage"] h2, [data-automation-id="applyFlowPage"] h3')?.textContent);
  const btn = workdayNextButton();
  const text = wdText(btn?.textContent);
  const review = !!d.querySelector('[data-automation-id="applyFlowReviewPage"]') || /^submit\b/i.test(text);
  return { title, kind: review ? "review" : btn ? "page" : "none", button: text };
}

function wdWrappers(): any[] {
  const root = doc().querySelector('[data-automation-id="applyFlowPage"]') ?? doc().body;
  const sel = '[data-automation-id^="formField-"], [data-automation-id="attachments-FileUpload"]';
  return (Array.from(root.querySelectorAll(sel)) as any[]).filter((w) => !w.parentElement?.closest(sel) && shown(w));
}
const cssEsc = (s: string) => (W.CSS?.escape ? W.CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&"));
function wdLabelOf(w: any, control: any): string {
  const lg = w.querySelector("legend");
  if (lg) return wdText(lg.textContent);
  const by = control?.id ? w.querySelector(`label[for="${cssEsc(control.id)}"]`) : null;
  const lab = by ?? w.querySelector("label");
  if (lab) return wdText(lab.textContent);
  const ref = w.getAttribute("aria-labelledby") || control?.getAttribute?.("aria-labelledby");
  const el = ref ? doc().getElementById(ref.split(/\s+/)[0]) : null;
  return wdText(el?.textContent || control?.getAttribute?.("aria-label") || aidOf(w).replace(/^formField-/, ""));
}
const sectionTitle = (g: any) => {
  const ref = String(g.getAttribute("aria-labelledby") || "").split(/\s+/)[0];
  const h = (ref && doc().getElementById(ref)) || (g.tagName === "FIELDSET" ? g.querySelector(":scope > legend") : null) || g.querySelector("h3, h4, h5");
  return wdText(h?.textContent);
};
const sectionKind = (title: string) =>
  /work\s*experience|employment history|work history/i.test(title) ? "work" : /^education/i.test(title) ? "education" : /^languages?$/i.test(title) ? "language"
    : /^(websites?|links?|web addresses|online profiles?)$/i.test(title) ? "website" : "other";
// WO-048 round 3 (sealed-wd2 t4: a past job's Location took the person's home city): a repeating section is known by any of
// its marks, not one. A row is any element labelled by a "<Section>-<n>-panel" id (with or without role="group", among
// other ids); its section box is the nearest group, region, fieldset, section or Workday "...Section" box above it; the
// kind comes from the box's title, else the row's panel name, else Workday's ids ("workExperience-31--location",
// "education-7--school", the box's "educationSection"), else a box above whose title names a section.
const PANEL = /^(.+?)-(\d+)-panel$/;
function panelOf(el: any): { name: string; n: number } | null {
  for (const t of String(el?.getAttribute?.("aria-labelledby") || "").split(/\s+/)) {
    const m = PANEL.exec(t);
    if (m) return { name: wdText(m[1].replace(/[-_]+/g, " ")), n: Number(m[2]) };
  }
  return null;
}
const isRow = (g: any) => !!panelOf(g);
const SECTION_BOX = '[role="group"], [role="region"], fieldset, section, [data-automation-id$="Section"]';
const ID_KINDS: [RegExp, string][] = [[/^workExperience/i, "work"], [/^education/i, "education"], [/^languages?(?![a-z])/i, "language"], [/^(websites?|webAddress(es)?)(?![a-z])/i, "website"]];
function idKind(id: string): string | null {
  const m = /^([A-Za-z]+?)(?:Section)?-\d+--/.exec(String(id || "")) ?? /^([A-Za-z]+?)Section$/.exec(String(id || ""));
  return m ? ID_KINDS.find(([re]) => re.test(m[1]) && m[1].replace(re, "") === "")?.[1] ?? null : null;
}
const KIND_TITLE: Record<string, string> = { work: "Work Experience", education: "Education", language: "Languages", website: "Websites" };
// A box's own title only: its label, its legend, or a heading no inner box owns (a page-wide box is not titled by the
// first section heading inside it).
function ownTitle(g: any): string {
  const ref = String(g.getAttribute("aria-labelledby") || "").split(/\s+/)[0];
  const el = (ref && doc().getElementById(ref)) || (g.tagName === "FIELDSET" ? g.querySelector(":scope > legend") : null) ||
    (Array.from(g.querySelectorAll("h2, h3, h4, h5")) as any[]).find((x) => x.parentElement?.closest(SECTION_BOX) === g && !rowOfField(x));
  return wdText(el?.textContent);
}
const boxKind = (g: any, title = sectionTitle(g)) => {
  const k = sectionKind(title.replace(/\s+\d+$/, ""));
  return k !== "other" ? k : idKind(aidOf(g)) ?? "other";
};
function rowOfField(w: any): any {
  for (let n = w.parentElement; n && n !== doc().body; n = n.parentElement) if (isRow(n)) return n;
  return null;
}
// The section box a row belongs to, and the rows of a section box.
function sectionOfRow(rowEl: any): any {
  for (let n = rowEl.parentElement; n && n !== doc().body; n = n.parentElement) if (!isRow(n) && n.matches?.(SECTION_BOX)) return n;
  return null;
}
const rowsOf = (g: any) => (Array.from(g.querySelectorAll("[aria-labelledby]")) as any[]).filter((r) => isRow(r) && sectionOfRow(r) === g);
// A box above the field (never its own wrapper) whose title or Workday id names a repeating section.
function enclosingKind(w: any): string | null {
  for (let n = w.parentElement; n && n !== doc().body; n = n.parentElement) {
    if (!n.matches?.(SECTION_BOX) || isRow(n)) continue;
    const k = boxKind(n, ownTitle(n));
    if (k !== "other") return k;
  }
  return null;
}
const PARTS: Record<string, string> = {
  jobTitle: "title", companyName: "employer", company: "employer", location: "location", currentlyWorkHere: "current", startDate: "start",
  endDate: "end", roleDescription: "description", schoolName: "school", school: "school", degree: "degree", fieldOfStudy: "major",
  gradeAverage: "gpa", firstYearAttended: "start", lastYearAttended: "end", language: "language", native: "fluent", url: "url",
};
function partOf(kind: string, id: string, label: string, list: boolean): string {
  const m = /--([A-Za-z0-9]+)$/.exec(String(id || "").replace(/-dateSection\w+-input$/, ""));
  if (m && PARTS[m[1]]) return PARTS[m[1]];
  const l = label.toLowerCase();
  const byLabel: [RegExp, string][] = [[/job title/, "title"], [/^company/, "employer"], [/^(school|university)/, "school"], [/^degree/, "degree"],
    [/field of study|^major/, "major"], [/gpa|overall result/, "gpa"], [/^from\b/, "start"], [/^to\b/, "end"], [/currently work/, "current"],
    [/^language$/, "language"], [/fluent/, "fluent"], [/^location$/, "location"], [/description/, "description"]];
  if (kind === "website" && /^(url|website|link|web address)$/.test(l)) return "url";
  for (const [re, p] of byLabel) if (re.test(l)) return p;
  if (kind === "language" && list) return "proficiency";
  return "unknown";
}
export function wdListValue(btn: any): string {
  const t = wdText(btn?.textContent);
  return /^select one$/i.test(t) ? "" : t;
}
function wdHiddenValue(btn: any): string {
  const n = btn?.nextElementSibling;
  return n && n.tagName === "INPUT" && n.type !== "file" ? String(n.value ?? "") : "";
}
const promptBox = (input: any) => input.closest('[data-automation-id="multiSelectContainer"]') ?? input.closest('[data-automation-id^="formField-"]') ?? input.parentElement;
function wdPills(input: any): string[] {
  return (Array.from(promptBox(input).querySelectorAll('[data-automation-id="promptSelectionLabel"]')) as any[]).map((p) => wdText(p.textContent)).filter(Boolean);
}
// The value a row's anchor shows (its company, school or language), which ties the row to one of the person's entries.
function anchorOf(kind: string, rowEl: any): string {
  const part = kind === "work" ? "employer" : kind === "education" ? "school" : kind === "language" ? "language" : kind === "website" ? "url" : "";
  if (!part) return "";
  for (const w of Array.from(rowEl.querySelectorAll('[data-automation-id^="formField-"]')) as any[]) {
    const c = w.querySelector('button[aria-haspopup="listbox"], [data-automation-id="searchBox"], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea');
    if (!c || partOf(kind, c.id, wdLabelOf(w, c), c.tagName === "BUTTON") !== part) continue;
    return c.tagName === "BUTTON" ? wdListValue(c) : aidOf(c) === "searchBox" ? wdPills(c).join(", ") : String(c.value ?? "").trim();
  }
  return "";
}
const sectionGroups = () => (Array.from(doc().querySelectorAll(SECTION_BOX)) as any[]).filter((g) => !isRow(g) && shown(g) &&
  (Array.from(g.querySelectorAll('[data-automation-id="add-button"]')) as any[]).some((a) => sectionOfRow(a) === g));
// The repeating sections on this step, with each row's anchor (empty for an empty row).
export function workdaySections(): { kind: string; title: string; anchors: string[] }[] {
  return sectionGroups().map((g) => {
    const title = sectionTitle(g), kind = boxKind(g, title);
    return { kind, title, anchors: rowsOf(g).map((r) => anchorOf(kind, r)) };
  });
}
// Workday's own Add (or Add Another) for a section: one more empty row. A page action, not a send.
export async function workdayAddRow(kind: string): Promise<boolean> {
  const g = sectionGroups().find((x) => boxKind(x) === kind);
  const add = g && (Array.from(g.querySelectorAll('[data-automation-id="add-button"]')) as any[]).find((a) => sectionOfRow(a) === g && shown(a));
  if (!add) return false;
  const n = rowsOf(g).length;
  press(add);
  return !!(await until(() => (rowsOf(g).length > n ? true : null), 2000));
}

// The country phone code the form shows ("+1" of "United States of America (+1)"); "" when its field is empty; undefined
// when the form has no such field.
function wdDial(): string | undefined {
  const w = doc().querySelector('[data-automation-id="formField-countryPhoneCode"]');
  if (!w) return undefined;
  const pills = (Array.from(w.querySelectorAll('[data-automation-id="promptSelectionLabel"]')) as any[]).map((p) => wdText(p.textContent));
  const btn = w.querySelector('button[aria-haspopup="listbox"]');
  const text = [...pills, btn ? wdListValue(btn) : ""].join(" ");
  return /\(\s*(\+\d{1,4})\s*\)/.exec(text)?.[1] ?? /(\+\d{1,4})\b/.exec(text)?.[1] ?? "";
}
// The disability self-identification (CC-305): always the person's.
function wdPersonal(w: any, control: any): boolean {
  if (w.closest('[data-automation-id="selfIdentificationPage"]')) return true;
  if (/^selfIdentifiedDisabilityData/.test(String(control?.id || "")) || /^formField-(disabilityStatus|disabilityForm|dateSignedOn)$/.test(aidOf(w))) return true;
  const g = w.closest('[role="group"]');
  return !!g && /self-identification of disability|\bcc-305\b/i.test(sectionTitle(g));
}

const dateParts = (wrapper: any) =>
  (Array.from(wrapper.querySelectorAll('[role="spinbutton"], input[data-automation-id^="dateSection"]')) as any[]).filter((x, i, a) => a.indexOf(x) === i);
function wdDateFormat(wrapper: any): string {
  return dateParts(wrapper).map((p) => {
    const a = aidOf(p) + " " + String(p.getAttribute("aria-label") || "");
    return /month/i.test(a) ? "MM" : /day/i.test(a) ? "DD" : "YYYY";
  }).join("/");
}
const fileWrapper = (input: any) => input.closest('[data-automation-id="attachments-FileUpload"], [data-automation-id^="formField-"]') ?? input.parentElement;
function readWorkdayValue(b: any, el: any): string {
  if (b.widget === "wd-list") return wdListValue(el);
  if (b.widget === "wd-prompt") return wdPills(el).join(", ");
  if (b.widget === "wd-date") {
    const v = dateParts(el).map((p) => String(p.value ?? ""));
    return v.every((x) => !x) ? "" : v.join("/");
  }
  if (b.widget === "wd-file") {
    const names = (Array.from(fileWrapper(el).querySelectorAll('[data-automation-id="file-upload-item-name"]')) as any[]).map((n) => wdText(n.textContent));
    return (names.length ? names : Array.from(el.files || []).map((f: any) => String(f.name))).join(", ");
  }
  return "";
}

// Every field of this step. Hidden fields (a conditional not shown) are not on the page for the person either: not read.
export function readWorkday(): Form {
  wdEls.clear();
  const bindings: Record<string, any> = {}, schema: any[] = [];
  const dial = wdDial();
  const taken = new Set<string>();
  const keep = (name: string, el: any) => {
    wdEls.set("wd:" + name, el);
    wdOwned.add(el);
  };
  for (const w of wdWrappers()) {
    if (w.querySelector('input[type="password"]')) continue; // never an account's password, wherever it shows
    const file = w.querySelector('input[type="file"]');
    const date = w.querySelector('[data-automation-id="dateInputWrapper"]');
    const prompt = w.querySelector('[data-automation-id="searchBox"]') ?? w.querySelector('[data-automation-id="multiSelectContainer"] input[type="text"]');
    const list = w.querySelector('button[aria-haspopup="listbox"]');
    const radios = Array.from(w.querySelectorAll('input[type="radio"]')) as any[];
    const boxes = Array.from(w.querySelectorAll('input[type="checkbox"]')) as any[];
    const area = w.querySelector("textarea");
    const text = w.querySelector('input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="url"]');
    let control: any = null, widget: string | null = null, inputType = "text", type = "text", optionEls: any[] = [];
    if (file) [control, widget, inputType, type] = [file, "wd-file", "file", "file"];
    else if (date) [control, widget, inputType, type] = [date, "wd-date", "text", "date"];
    else if (prompt) [control, widget, inputType, type] = [prompt, "wd-prompt", "select", "select"];
    else if (list) [control, widget, inputType, type] = [list, "wd-list", "select", "select"];
    else if (radios.length) [control, inputType, type, optionEls] = [radios[0], "radio_group", "radio", radios];
    else if (boxes.length > 1) [control, inputType, type, optionEls] = [boxes[0], "checkbox_group", "checkbox", boxes];
    else if (boxes.length === 1) [control, inputType, type] = [boxes[0], "checkbox", "checkbox"];
    else if (area) [control, type] = [area, "textarea"];
    else if (text) [control, type] = [text, "text"];
    else continue;
    let label = wdLabelOf(w, control);
    const required = !!w.querySelector('abbr[title="required"]') || (Array.from(w.querySelectorAll("abbr")) as any[]).some((a) => /\*/.test(a.textContent)) ||
      control.getAttribute?.("aria-required") === "true";
    const rowEl = rowOfField(w);
    const g = rowEl ? sectionOfRow(rowEl) : null;
    const panel = rowEl ? panelOf(rowEl) : null;
    let section: any = null;
    // The section's kind by its first mark that names one (round 3); "other" when none does (a row of another section).
    const ids = [control.id, control.getAttribute?.("name"), w.querySelector('[data-automation-id="dateInputWrapper"]')?.id].map((x) => String(x || ""));
    const marked = (g ? [boxKind(g)] : []).concat(panel ? [sectionKind(panel.name)] : [], ids.map((x) => idKind(x) ?? "other"), [enclosingKind(w) ?? "other"])
      .find((k) => k !== "other");
    if (rowEl) {
      const kind = marked ?? "other";
      const title = (g ? sectionTitle(g).replace(/\s+\d+$/, "") : "") || KIND_TITLE[kind] || panel!.name;
      const row = panel!.n;
      const part = kind === "other" ? "unknown" : partOf(kind, widget === "wd-file" ? "" : String(control.id || ""), label, widget === "wd-list");
      section = { kind, row, part, anchor: anchorOf(kind, rowEl), ...(widget === "wd-date" ? { format: wdDateFormat(control) } : {}) };
      label = `${title} ${row}: ${label}`;
    } else if (marked) {
      // Inside a repeating section but in no row the reader can tie to one of the person's entries: row 0, part unknown. The
      // planner leaves it (asked when required) and never answers it from a fact about the person.
      section = { kind: marked, row: 0, part: "unknown", anchor: "" };
      label = `${KIND_TITLE[marked]}: ${label}`;
    } else if (widget === "wd-file") {
      // An upload under its section's heading ("Resume/CV: Upload a file"), so the planner knows which document it takes.
      const sg = w.closest('[role="group"]');
      const t = sg ? sectionTitle(sg) : "";
      if (t && !label.toLowerCase().includes(t.toLowerCase())) label = `${t}: ${label}`;
    }
    const idName = widget === "wd-file" ? (w.querySelector('[data-automation-id="select-files"]')?.id || file.id)
      : inputType === "radio_group" ? (control.name || control.id) : inputType === "checkbox_group" ? "" : String(control.id || "");
    const base = idName || `${aidOf(w) || "field"}${section ? `@${section.kind}-${section.row}` : ""}`;
    let name = base;
    for (let i = 2; taken.has(name); i++) name = `${base}~${i}`;
    taken.add(name);
    keep(name, control);
    const options = optionEls.length
      ? optionEls.map((o, i) => {
        const l = o.id ? doc().querySelector(`label[for="${cssEsc(o.id)}"]`) : o.closest("label");
        const ol = wdText(l?.textContent || o.getAttribute("aria-label") || o.value);
        keep(`${name}#${i}`, o);
        return { label: ol, value: o.value && o.value !== "on" ? String(o.value) : ol, selector: `wd:${name}#${i}` };
      })
      : (wdOptions.get(name) ?? []).map((l) => ({ label: l, value: l, selector: "" }));
    if (new Set(options.map((o) => o.value)).size !== options.length) options.forEach((o) => (o.value = o.label));
    const isPhone = !section && type === "text" && (/--phoneNumber$/.test(String(control.id || "")) || /^phone number$/i.test(label));
    schema.push({
      name, label: label || name, type, required, options: options.map((o) => ({ label: o.label, value: o.value })),
      ...(section ? { section } : {}), ...(isPhone && dial !== undefined ? { dial } : {}), ...(wdPersonal(w, control) ? { personal: true } : {}),
    });
    bindings[name] = { field_id: name, inputType, selector: "wd:" + name, options: optionEls.length ? options : [], widget, elementRefs: [] };
  }
  return { raw: [], bindings, schema };
}

// ---- driving Workday's widgets: each list opened, read or chosen from, and closed again
const listboxes = () => (Array.from(doc().querySelectorAll('[role="listbox"]')) as any[]).filter((l) => shown(l) && !l.closest('[data-automation-id="selectedItemList"]'));
const optionsIn = (lb: any) => (Array.from(lb.querySelectorAll('[role="option"]')) as any[]).filter(shown);
const optText = (o: any) => wdText(o.getAttribute("data-automation-label") || (o.querySelector('[data-automation-id="promptLeafNode"]') ?? o).textContent).replace(/\s*›$/, "");
const isCategory = (o: any) => o.getAttribute("aria-haspopup") === "true" || !!o.querySelector('[data-automation-id="promptOptionMore"], .wd-icon-chevron-right-small');
async function wdClose(trigger: any) {
  if (!listboxes().length) return;
  (trigger ?? doc().body).dispatchEvent(new W.KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
  await sleep(20);
  if (listboxes().length) {
    press(doc().body);
    await sleep(20);
  }
}
async function wdOpen(trigger: any): Promise<any> {
  await wdClose(trigger);
  const before = new Set(listboxes());
  trigger.focus?.();
  press(trigger);
  return await until(() => listboxes().find((l) => !before.has(l) && optionsIn(l).length) ?? null, 1500);
}
// The list open after a click inside one (a category opened): a listbox that was not there before.
async function wdNext(before: any): Promise<any> {
  return await until(() => listboxes().find((l) => l !== before && optionsIn(l).length) ?? null, 1500);
}
async function wdPromptLeaves(input: any, name: string): Promise<string[]> {
  const leaves: string[] = [], paths = new Map<string, string[]>();
  const queue: string[][] = [[]];
  let opened = 0;
  while (queue.length && opened < 40 && leaves.length < 500) {
    const path = queue.shift()!;
    let lb = await wdOpen(input);
    opened++;
    for (const step of path) {
      const o = lb && optionsIn(lb).find((x) => optText(x) === step);
      if (!o) {
        lb = null;
        break;
      }
      press(o);
      lb = await wdNext(lb);
    }
    if (!lb) continue;
    for (const o of optionsIn(lb)) {
      const t = optText(o);
      if (!t) continue;
      if (isCategory(o)) {
        if (path.length < 3) queue.push([...path, t]);
      } else {
        const label = [...path, t].join(PATH_SEP);
        if (!paths.has(label)) {
          paths.set(label, path);
          leaves.push(label);
        }
      }
    }
  }
  await wdClose(input);
  wdPaths.set(name, paths);
  return leaves;
}
// Each listbox's and prompt's options, read once per Fill by opening it (nothing is chosen).
export function clearWorkdayOptions() {
  wdOptions.clear();
  wdPaths.clear();
}
export async function loadWorkdayOptions(form: Form): Promise<void> {
  for (const [name, b] of Object.entries(form.bindings) as [string, any][]) {
    if (wdOptions.has(name) || (b.widget !== "wd-list" && b.widget !== "wd-prompt")) continue;
    const el = firstEl(b);
    if (!el) continue;
    if (b.widget === "wd-list") {
      const lb = await wdOpen(el);
      const labels = lb ? optionsIn(lb).filter((o) => o.getAttribute("aria-disabled") !== "true").map(optText).filter((t) => t && !/^select one$/i.test(t)) : [];
      await wdClose(el);
      wdOptions.set(name, labels);
    } else {
      wdOptions.set(name, await wdPromptLeaves(el, name));
    }
  }
}
async function wdChooseList(btn: any, wanted: string): Promise<boolean> {
  if (wdListValue(btn) === wanted) return true;
  const lb = await wdOpen(btn);
  const hit = lb ? optionsIn(lb).find((o) => optText(o) === wanted && o.getAttribute("aria-disabled") !== "true") : null;
  if (!hit) {
    await wdClose(btn);
    return false;
  }
  press(hit);
  const ok = await until(() => (wdListValue(btn) === wanted ? true : null), 1200);
  await wdClose(btn);
  return !!ok;
}
// The option the planner chose, by its label as read (a leaf, or "Category > Leaf"): Workday's own search first, typed as
// the leaf's text, waiting for its results, and taken only when exactly one result is that leaf (a leaf of the same name
// under another category makes the search unsure); then the categories it was found under when the list was read.
async function wdChoosePrompt(input: any, label: string, name: string): Promise<boolean> {
  const wanted = leafOf(label);
  if (wdPills(input).includes(wanted)) return true;
  const twins = [...(wdPaths.get(name)?.keys() ?? [])].filter((l) => leafOf(l) === wanted).length;
  await wdClose(input);
  input.focus?.();
  setNative(input, wanted);
  input.dispatchEvent(new W.InputEvent("input", { bubbles: true, inputType: "insertText", data: wanted }));
  input.dispatchEvent(new W.KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
  const results = () => listboxes().flatMap(optionsIn).filter((o) => !isCategory(o) && optText(o) === wanted);
  let hit = twins > 1 ? null : await until(() => (results().length ? results() : null), 3000).then((r) => (r && r.length === 1 ? r[0] : null));
  if (!hit) {
    await wdClose(input);
    setNative(input, "");
    input.dispatchEvent(new W.InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    const path = wdPaths.get(name)?.get(label);
    if (path) {
      let lb = await wdOpen(input);
      for (const step of path) {
        const o = lb && optionsIn(lb).find((x) => optText(x) === step);
        lb = o ? (press(o), await wdNext(lb)) : null; // a category no longer there: nothing is chosen
        if (!lb) break;
      }
      hit = lb ? optionsIn(lb).find((o) => !isCategory(o) && optText(o) === wanted) ?? null : null;
    }
  }
  if (!hit) {
    await wdClose(input);
    return false;
  }
  press(hit);
  const ok = await until(() => (wdPills(input).includes(wanted) ? true : null), 1200);
  await wdClose(input);
  if (String(input.value ?? "")) setNative(input, "");
  return !!ok;
}
function wdTypeDate(wrapper: any, value: string): boolean {
  const parts = dateParts(wrapper), vals = String(value).split("/");
  if (!parts.length || vals.length !== parts.length) return false;
  parts.forEach((p, i) => {
    p.focus?.();
    setNative(p, vals[i]);
    p.dispatchEvent(new W.InputEvent("input", { bubbles: true, inputType: "insertText", data: vals[i] }));
    fire(p, "change");
  });
  parts[parts.length - 1].blur?.();
  return dateParts(wrapper).map((p) => String(p.value ?? "")).join("/") === value;
}
async function fillWorkday(b: any, el: any, value: string, resume: Resume | null): Promise<boolean> {
  if (b.widget === "wd-list") return await wdChooseList(el, value);
  if (b.widget === "wd-prompt") return await wdChoosePrompt(el, value, b.field_id);
  if (b.widget === "wd-date") return wdTypeDate(el, value);
  if (b.widget === "wd-file") {
    if (!resume) return false;
    const dt = new W.DataTransfer();
    dt.items.add(new File([resume.bytes as BlobPart], resume.name, { type: resume.type || "application/pdf" }));
    el.files = dt.files;
    fire(el, "input", "change");
    return !!(await until(() => (readWorkdayValue(b, el) ? true : null), 1500));
  }
  return false;
}

// The review step's own reading of every answer (Workday's summary: each section's title, each label and its value).
export function readWorkdayReview(): { name: string; label: string; value: string }[] {
  const root = doc().querySelector('[data-automation-id="applyFlowReviewPage"]') ?? doc().querySelector('[data-automation-id="applyFlowPage"]');
  if (!root) return [];
  const out: { name: string; label: string; value: string }[] = [];
  const dts = (Array.from(root.querySelectorAll("dt")) as any[]).filter(shown);
  for (const dt of dts) {
    let dd = dt.nextElementSibling;
    while (dd && dd.tagName !== "DD" && dd.tagName !== "DT") dd = dd.nextElementSibling;
    const sec = dt.closest("section, [data-automation-id$='-section']") ?? dt.parentElement?.parentElement;
    const head = wdText(sec?.querySelector("h2, h3, h4")?.textContent);
    out.push({ name: `review:${out.length + 1}`, label: `${head ? head + ": " : ""}${wdText(dt.textContent)}`, value: dd && dd.tagName === "DD" ? wdText(dd.textContent) : "" });
  }
  if (!dts.length) {
    for (const w of (Array.from(root.querySelectorAll('[data-automation-id^="formField-"]')) as any[]).filter(shown)) {
      const lab = w.querySelector("label, legend, dt");
      const label = wdText(lab?.textContent);
      const value = wdText(String(w.textContent || "").replace(String(lab?.textContent || ""), ""));
      if (label) out.push({ name: `review:${out.length + 1}`, label, value });
    }
  }
  return out;
}
