// A minimal DOM for driving a web module's mount() outside a browser (FEATURE E2E): elements with children, text,
// attributes, class names, button state and click handlers; enough for src/career-apply-card.js. text() is what a person
// reads; buttons() finds a button by its label.
export interface FakeEl {
  tag: string; className: string; textContent: string; type?: string; disabled?: boolean; onclick?: (() => unknown) | null;
  parent: FakeEl | null; children: FakeEl[]; attrs: Record<string, string>; ownerDocument: FakeDoc;
  appendChild(c: FakeEl): FakeEl; append(...c: FakeEl[]): void; replaceChildren(...c: FakeEl[]): void; replaceWith(...c: FakeEl[]): void;
  setAttribute(k: string, v: string): void; text(): string; buttons(): FakeEl[];
}
export interface FakeDoc { createElement(tag: string): FakeEl }
export function fakeDocument(): FakeDoc {
  const doc: FakeDoc = { createElement: (tag: string) => make(tag) };
  function make(tag: string): FakeEl {
    let own = "";
    const e: FakeEl = {
      tag, className: "", parent: null, children: [], attrs: {}, ownerDocument: doc,
      get textContent() { return own; },
      set textContent(v: string) { own = String(v); e.children = []; },
      appendChild(c) { c.parent = e; e.children.push(c); return c; },
      append(...cs) { for (const c of cs) e.appendChild(c); },
      replaceChildren(...cs) { e.children = []; own = ""; e.append(...cs); },
      replaceWith(...cs) {
        const p = e.parent!;
        const i = p.children.indexOf(e);
        for (const c of cs) c.parent = p;
        p.children.splice(i, 1, ...cs);
      },
      setAttribute(k, v) { e.attrs[k] = String(v); },
      text() { return [own, ...e.children.map((c) => c.text())].filter(Boolean).join("\n"); },
      buttons() { return [...(e.tag === "button" ? [e] : []), ...e.children.flatMap((c) => c.buttons())]; },
    } as FakeEl;
    return e;
  }
  return doc;
}
