// FakePage — a GuardPage double for the execution-trust fixtures.
//
// It implements the SAME structural contract the real BbPage satisfies
// (see GuardPage in supabase/functions/agent-exec/execution-guards.ts) and
// records every driver call in order. It makes NO guard decisions itself:
// the tripwire scan, step loop, and success criteria are all executed by the
// REAL runDeclarative imported from the shared production module.
//
// Page model: `texts` is the visible page text returned by each successive
// document.body.innerText read (the tripwire scan reads it before EVERY
// step, requireText reads it once more). This models the page changing as
// the run progresses. `clicks` maps a clickText pattern to its result
// (null = control not found, like the real driver returns).

export class FakePage {
  constructor({ texts = [""], clicks = {} } = {}) {
    this.texts = texts;
    this.clicks = clicks;
    this.evalCount = 0;
    this.calls = []; // [method, ...args] in call order
  }

  async eval(js) {
    this.calls.push(["eval", js.slice(0, 60)]);
    if (js.includes("innerText")) {
      const t = this.texts[Math.min(this.evalCount, this.texts.length - 1)] ?? "";
      this.evalCount++;
      return t;
    }
    return "";
  }

  async goto(url, _timeoutMs) {
    this.calls.push(["goto", url]);
  }

  async waitFor(js, _timeoutMs) {
    this.calls.push(["waitFor", js.slice(0, 60)]);
    return true;
  }

  async clickText(pattern) {
    this.calls.push(["clickText", pattern]);
    if (pattern in this.clicks) return this.clicks[pattern];
    return `matched:${pattern}`;
  }

  async clickFirst(selectors) {
    this.calls.push(["clickFirst", selectors.join(",").slice(0, 60)]);
    return "matched:first";
  }

  async clickDialogButton(pattern) {
    this.calls.push(["clickDialogButton", pattern]);
    return `matched:${pattern}`;
  }

  async typeInto(selectors, text) {
    this.calls.push(["typeInto", selectors.join(",").slice(0, 40)]);
    return "typed";
  }

  async fillOtp(_code) {
    this.calls.push(["fillOtp"]);
    return "otp-entered";
  }

  async screenshot(label) {
    this.calls.push(["screenshot", label]);
    return { label, data: "fake-png-bytes" };
  }

  /** Count calls to a driver method, optionally filtered by first arg. */
  countCalls(method, arg) {
    return this.calls.filter(
      ([m, a]) => m === method && (arg === undefined || a === arg),
    ).length;
  }
}
