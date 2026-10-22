// Ashby yes/no parity (wo/first-real-submission): Ashby renders a yes/no question as two buttons (data-option yes/no,
// aria-pressed) over a hidden checkbox. A "No" leaves that box unchecked, exactly like a question nobody answered, so the
// pressed button is the only place the page shows the answer. The reader (extension/src/dom.ts) reads the pressed button
// for the card (readValue) and binds it into what the approval covers (readDetail), for Trainee's press and the person's.
//
// Markup: the first yes/no question of the Crusoe capture (tests/fixtures/forms-ci), as Ashby rendered it, in a DOM
// parsed by deno-dom. TEST data; no network beyond the module cache, no model.
import { DOMParser } from "jsr:@b-fuze/deno-dom@0.1.48";
import * as D from "../../extension/src/dom.ts";
// A namespace import, so each test fails on its own (fail-first) rather than the module failing to link.
const { readDetail, readValue } = D;
const yesNoPress = (t: unknown): boolean => {
  const f = (D as any).yesNoPress;
  if (typeof f !== "function") throw new Error("dom.ts exports no yesNoPress");
  return f(t);
};

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}

const CAPTURE = new URL("../fixtures/forms-ci/ashby-crusoe-b1b99030-d393-4329-80fe-5bc2e4c93b03.html", import.meta.url);
const html = Deno.readTextFileSync(CAPTURE);
// One whole Ashby field entry holding a yes/no question (label, description, the two buttons, the hidden box).
const entry = html.match(/<div class="[^"]*ashby-application-form-field-entry"[^>]*>(?:(?!ashby-application-form-field-entry).)*?ashby-application-form-input-yesno"[\s\S]*?<\/div><\/div>/);
assert(entry, "the Crusoe capture holds an Ashby yes/no question");
const NAME = entry[0].match(/<input type="checkbox"[^>]*name="([^"]+)"/)?.[1];
assert(NAME, "its hidden checkbox has a name");
const B = { selector: `[name="${NAME}"]`, inputType: "checkbox" };

// A fresh page holding that question; `edit` puts the page into the state under test.
function page(edit: (d: any) => void = () => {}) {
  const d: any = new DOMParser().parseFromString(`<!doctype html><html><body><div class="ashby-application-form-container">${entry![0]}</div></body></html>`, "text/html");
  (globalThis as any).document = d;
  edit(d);
  return d;
}
const btn = (d: any, o: "yes" | "no") => d.querySelector(`button[data-option="${o}"]`);
const press = (o: "yes" | "no") => (d: any) => {
  for (const x of ["yes", "no"] as const) btn(d, x).setAttribute("aria-pressed", String(x === o));
};

Deno.test("ashby yes/no: the capture renders aria-pressed on both buttons, false until pressed (no pressed state in any capture)", () => {
  const d = page();
  eq([btn(d, "yes").getAttribute("aria-pressed"), btn(d, "no").getAttribute("aria-pressed")], ["false", "false"]);
  // The class keeps an empty slot between Ashby's option class and its own name: where a selected-state class goes.
  assert(/_option_\w+ {2}ashby-application-form-input-yesno-option/.test(btn(d, "no").getAttribute("class")), "the empty class slot");
});

Deno.test("ashby yes/no: nobody pressed: nothing to show, and the approval says none was pressed", () => {
  page();
  eq(readValue(B), "", "an unanswered question reads empty");
  assert(/;pressed=none$/.test(readDetail(B)), "the detail binds that nothing is pressed: " + readDetail(B));
});

Deno.test("ashby yes/no: a pressed No reads No and the approval binds the No, though the box stays unchecked", () => {
  const d = page(press("no"));
  assert(!d.querySelector(B.selector).hasAttribute("checked"), "the box is unchecked, as Ashby leaves it for a No");
  eq(readValue(B), "No");
  assert(/;pressed=no$/.test(readDetail(B)), "the detail binds the No: " + readDetail(B));
});

Deno.test("ashby yes/no: a No and an unanswered question are different approvals", () => {
  page();
  const none = readDetail(B);
  page(press("no"));
  assert(readDetail(B) !== none, "a card approved with the question open does not match the page with a No");
});

Deno.test("ashby yes/no: a pressed Yes reads Yes before the page has checked its box (React renders it a tick later)", () => {
  page(press("yes"));
  eq(readValue(B), "Yes");
  assert(/;pressed=yes$/.test(readDetail(B)), "the detail binds the Yes: " + readDetail(B));
});

Deno.test("ashby yes/no: the selected-state class is read where the page renders no aria-pressed", () => {
  page((d) => {
    for (const x of ["yes", "no"] as const) btn(d, x).removeAttribute("aria-pressed");
    btn(d, "no").setAttribute("class", btn(d, "no").getAttribute("class").replace("  ", " _active_1svni_40 "));
  });
  eq(readValue(B), "No");
  assert(/;pressed=no$/.test(readDetail(B)), readDetail(B));
});

Deno.test("ashby yes/no: an explicit aria-pressed=false wins over a stray class (the page's own accessibility state)", () => {
  page((d) => btn(d, "no").setAttribute("class", btn(d, "no").getAttribute("class") + " selected"));
  eq(readValue(B), "");
});

Deno.test("ashby yes/no: a press on either button (or inside it) is a yes/no press; anything else is not", () => {
  const d = page();
  assert(yesNoPress(btn(d, "no")) && yesNoPress(btn(d, "yes")), "both buttons");
  assert(!yesNoPress(d.querySelector(B.selector)), "the hidden box is not a button press");
  assert(!yesNoPress(d.querySelector("label")), "the question's title is not");
  assert(!yesNoPress(null), "nothing is not");
});

Deno.test("ashby yes/no: a plain checkbox (Greenhouse, Lever) reads and binds as before", () => {
  const d: any = new DOMParser().parseFromString(`<form><label><input type="checkbox" name="ack" value="yes"> I agree</label></form>`, "text/html");
  (globalThis as any).document = d;
  const b = { selector: "[name='ack']", inputType: "checkbox" };
  eq(readValue(b), "");
  assert(!/pressed=/.test(readDetail(b)), "no pressed part where there are no buttons: " + readDetail(b));
  assert(/^checked=false;value=/.test(readDetail(b)), readDetail(b));
});
