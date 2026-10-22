"use strict";

// F-024: synthetic empty Lever disability controls, including the option wording
// present in forms-ci/lever-shieldai-ba945088-38ec-4e58-8f66-01c0497a3bd3.html.
// Compile the actual helper with test-only access to its private fill functions;
// no browser, network, worker command, submit or applicant data is involved.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const helperPath = path.resolve(__dirname, "../scripts/career/portal-browser-helper.cjs");

const YES = "Yes, I have a disability, or have had one in the past";
const NO = "No, I do not have a disability and have not had one in the past";
const DECLINE = "I do not want to answer";
const WANTED_DECLINE = "Decline to self-identify";
const options = () => [
  { value: "", label: "Select ..." },
  { value: YES, label: YES },
  { value: NO, label: NO },
  { value: DECLINE + " ", label: DECLINE },
];

function loadHelper(document = {}) {
  const context = {
    module: { exports: {} }, require: createRequire(helperPath),
    __dirname: path.dirname(helperPath), __filename: helperPath,
    process: { argv: [], env: {} }, console, setTimeout, URL, Buffer, document,
  };
  vm.runInNewContext(fs.readFileSync(helperPath, "utf8") +
    "\nmodule.exports.__f024 = { matchOption, fillOnceHandles, readbackBinding, driveWidget };\n",
  context, { filename: helperPath, timeout: 2000 });
  return context.module.exports.__f024;
}

function nativeSelect(items = options()) {
  const element = { isConnected: true, options: items.map(o => ({ value: o.value, textContent: o.label })), selectedIndex: 0 };
  const selections = [];
  const handle = {
    evaluate: async fn => fn(element),
    selectOption: async ({ value }) => {
      const index = items.findIndex(o => o.value === value);
      assert.ok(index >= 0, "fill must send an actual option value, not invented text");
      element.selectedIndex = index; selections.push(value);
    },
  };
  const binding = { inputType: "select", elementRefs: ["synthetic-disability"], options: items };
  return { board: { handles: new Map([["synthetic-disability", handle]]) }, binding, selections };
}

function widget(items = options().slice(1)) {
  let selected = null;
  const clicks = [];
  const nodes = items.map(o => {
    const attributes = new Map();
    return { innerText: o.label, textContent: o.label, offsetParent: {},
      getClientRects: () => [{}], setAttribute: (k, v) => attributes.set(k, v),
      removeAttribute: k => attributes.delete(k), marked: () => attributes.has("data-upmore-opt") };
  });
  const control = {
    querySelector: selector => /single-value|singleValue/.test(selector) && selected ? { textContent: selected } : null,
    parentElement: { querySelector: () => null },
  };
  const input = { closest: () => control, parentElement: control, getAttribute: () => "true" };
  const document = {
    querySelector: selector => selector === "#synthetic-disability" ? input : null,
    querySelectorAll: selector => selector === "[data-upmore-opt]" ? nodes.filter(n => n.marked())
      : selector === ".select__option" || selector === '[role="option"]' ? nodes : [],
  };
  const page = {
    click: async selector => {
      if (selector === '[data-upmore-opt="1"]') {
        const marked = nodes.filter(n => n.marked());
        assert.equal(marked.length, 1, "the actual matcher must choose one concrete option");
        selected = marked[0].innerText; clicks.push(selected);
      }
    },
    fill: async () => {}, type: async () => {}, waitForTimeout: async () => {},
    evaluate: async (fn, arg) => fn(arg), keyboard: { press: async () => {} },
  };
  return { helper: loadHelper(document), board: { page }, clicks,
    binding: { widget: "react-select", selector: "#synthetic-disability" } };
}

test("F024 native Lever select fills decline using its exact machine value and rendered readback", async () => {
  const helper = loadHelper(), f = nativeSelect();
  const result = await helper.fillOnceHandles(f.board, { binding: f.binding, value: WANTED_DECLINE });
  assert.equal(result.filled, true);
  assert.equal(result.expect, DECLINE);
  assert.deepEqual(f.selections, [DECLINE + " "]);
  assert.equal(await helper.readbackBinding(f.board, f.binding), DECLINE);
});

test("F024 radio decline chooses only the decline option, never a disability assertion", async () => {
  const helper = loadHelper(), checked = [];
  const items = options().slice(1).map((o, i) => ({ ...o, ref: "radio-" + i }));
  const handles = new Map(items.map(o => [o.ref, { evaluate: async fn => fn({ isConnected: true }), check: async () => checked.push(o.label) }]));
  const result = await helper.fillOnceHandles({ handles }, {
    binding: { inputType: "radio_group", elementRefs: [items[0].ref], options: items }, value: WANTED_DECLINE,
  });
  assert.equal(result.filled, true);
  assert.equal(result.expect, DECLINE);
  assert.deepEqual(checked, [DECLINE]);
});

test("F024 react-select uses the same decline class and an actual option pick", async () => {
  const f = widget();
  const result = await f.helper.driveWidget(f.board, { binding: f.binding, value: WANTED_DECLINE });
  assert.equal(result.via, "widget_option_pick");
  assert.equal(result.chosenText, DECLINE);
  assert.equal(result.expect, DECLINE);
  assert.deepEqual(f.clicks, [DECLINE]);
});

for (const label of ["I don't wish to answer", "Prefer not to answer", "Decline to self-identify"]) {
  test("CONTROL existing decline wording still fills: " + label, async () => {
    const helper = loadHelper(), f = nativeSelect([{ value: "", label: "Select ..." }, { value: "kept", label }]);
    const result = await helper.fillOnceHandles(f.board, { binding: f.binding, value: WANTED_DECLINE });
    assert.equal(result.filled, true); assert.equal(result.expect, label);
    assert.deepEqual(f.selections, ["kept"]);
  });
}

for (const answer of [YES, NO]) {
  test("CONTROL the person's explicit substantive choice stays exact: " + answer, async () => {
    const helper = loadHelper(), f = nativeSelect();
    const result = await helper.fillOnceHandles(f.board, { binding: f.binding, value: answer });
    assert.equal(result.filled, true); assert.equal(result.expect, answer);
    assert.deepEqual(f.selections, [answer]);
  });
}

test("CONTROL unknown answer does not choose any option", async () => {
  const helper = loadHelper(), f = nativeSelect();
  const result = await helper.fillOnceHandles(f.board, { binding: f.binding, value: "Maybe" });
  assert.equal(result.filled, false); assert.equal(result.reason, "option_not_found");
  assert.deepEqual(f.selections, []);
});

test("CONTROL absent decline option never falls back to yes or no", async () => {
  const helper = loadHelper(), f = nativeSelect(options().slice(0, 3));
  const result = await helper.fillOnceHandles(f.board, { binding: f.binding, value: WANTED_DECLINE });
  assert.equal(result.filled, false); assert.equal(result.reason, "option_not_found");
  assert.deepEqual(f.selections, []);
});

test("CONTROL react-select preserves explicit no", async () => {
  const f = widget();
  const result = await f.helper.driveWidget(f.board, { binding: f.binding, value: NO });
  assert.equal(result.chosenText, NO); assert.deepEqual(f.clicks, [NO]);
});

test("CONTROL react-select without a decline option makes no option pick", async () => {
  const f = widget(options().slice(1, 3));
  const result = await f.helper.driveWidget(f.board, { binding: f.binding, value: WANTED_DECLINE });
  assert.equal(result.chosenText, null); assert.deepEqual(f.clicks, []);
});
