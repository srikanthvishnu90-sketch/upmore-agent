import json, html, pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path.home() / "workspace/your_files/upmore-conversations"
summary = json.loads(pathlib.Path("/tmp/k8-surfaces.json").read_text())

CSS = """
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#f4f4f6;margin:0;padding:24px;}
.wrap{max-width:872px;margin:0 auto;}
h1{font-size:22px;color:#14231b;margin:4px 0 16px;}
.msg{border-radius:14px;padding:12px 16px;margin:10px 0;white-space:pre-wrap;font-size:16px;line-height:1.45;max-width:78%;}
.user{background:#2e9e6b;color:#fff;margin-left:auto;}
.agent{background:#fff;color:#1c1c1e;border:1px solid #e2e2e6;margin-right:auto;}
.who{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.65;margin-bottom:4px;}
.card{background:#2b2b2e;color:#f2f2f4;border-radius:16px;padding:20px 22px;white-space:pre-wrap;font-size:16px;line-height:1.5;}
.panel{background:#fff;border:1px solid #e2e2e6;border-radius:16px;padding:20px 22px;white-space:pre-wrap;font-size:16px;line-height:1.5;color:#1c1c1e;}
.badge{display:inline-block;background:#e7f4ec;color:#1d6f43;border-radius:999px;padding:3px 10px;font-size:13px;margin-bottom:10px;}
.sub{color:#6b6b70;font-size:13px;margin-top:10px;}
"""

def page(body):
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body><div class='wrap'>{body}</div></body></html>"

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": 920, "height": 1200})
    for s in summary:
        msgs = json.loads((OUT / f"{s['base']}.messages.json").read_text())["messages"]
        bubbles = "".join(
            f"<div class='msg {'user' if m['who']=='user' else 'agent'}'><div class='who'>{'You' if m['who']=='user' else 'Upmore'}</div>{html.escape(m['text'])}</div>"
            for m in msgs)
        pg.set_content(page(f"<h1>{html.escape(s['title'])}</h1>{bubbles}"))
        pg.screenshot(path=str(OUT / f"{s['base']}.png"), full_page=True)
        if s.get("card"):
            pg.set_content(page(f"<h1>Approval card — {html.escape(s['title'])}</h1><div class='card'>{html.escape(s['card'])}</div><div class='sub'>Rendered from PortalCases.prepare output, production code path. Sandbox rail; live provider NOT_WIRED.</div>"))
            pg.screenshot(path=str(OUT / f"{s['base']}-surface-card.png"), full_page=True)
        elif s.get("answer"):
            pg.set_content(page(f"<h1>Answer — {html.escape(s['title'])}</h1><div class='panel'>{html.escape(s['answer'])}</div><div class='sub'>Read-only. Rendered from PortalCases.prepare output, production code path.</div>"))
            pg.screenshot(path=str(OUT / f"{s['base']}-surface-answer.png"), full_page=True)
        state = s["state"] or "—"
        ref = s["reference"] or "—"
        pg.set_content(page(f"<h1>Case record — {html.escape(s['title'])}</h1><span class='badge'>Provider record state: {html.escape(state)}</span><div class='panel'>{html.escape(s['outcome'])}</div><div class='sub'>Sandbox reference: {html.escape(ref)}. State read back from the sandbox provider's own record by PortalCases.verify.</div>"))
        pg.screenshot(path=str(OUT / f"{s['base']}-surface-outcome.png"), full_page=True)
    b.close()
print("rendered", len(summary), "items")
