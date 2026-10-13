import json, html, pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path.home() / "workspace/your_files/upmore-conversations"
items = json.loads(pathlib.Path("/tmp/k8-doorsteps.json").read_text())

CSS = """
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#f4f4f6;margin:0;padding:24px;}
.wrap{max-width:872px;margin:0 auto;}
h1{font-size:22px;color:#14231b;margin:4px 0 16px;}
.box{background:#fff;border:1px solid #e2e2e6;border-radius:16px;padding:22px;}
label{display:block;font-size:13px;color:#6b6b70;margin:14px 0 6px;}
.field{border:1px solid #d8d8de;border-radius:10px;padding:12px;font-size:15px;color:#9a9aa0;background:#fafafa;}
.btn{margin-top:20px;background:#2e9e6b;color:#fff;text-align:center;border-radius:10px;padding:13px;font-size:16px;}
.btn-stop{background:#d8d8de;color:#55565c;text-decoration:line-through;}
.step{font-size:15px;line-height:1.55;color:#1c1c1e;margin:8px 0;white-space:pre-wrap;}
.stop{margin-top:16px;background:#fdf3e3;border:1px solid #ecd9ae;border-radius:10px;padding:14px;font-size:15px;line-height:1.5;}
.badge{display:inline-block;background:#e7f4ec;color:#1d6f43;border-radius:999px;padding:3px 10px;font-size:13px;margin-bottom:10px;}
.sub{color:#6b6b70;font-size:13px;margin-top:10px;}
"""

def page(body):
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body><div class='wrap'>{body}</div></body></html>"

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": 920, "height": 1000})
    for s in items:
        steps = "".join(f"<div class='step'>{i+1}. {html.escape(t)}</div>" for i, t in enumerate(s["steps"]))
        pg.set_content(page(
            f"<h1>{html.escape(s['signin_title'])}</h1><div class='box'>"
            f"<span class='badge'>Guided manual connect — sandbox surface</span>"
            f"<label>EMAIL OR ACCOUNT ID</label><div class='field'>(the owner types it here, in the provider's own window)</div>"
            f"<label>PASSWORD</label><div class='field'>(the owner types it here — never in chat, never stored)</div>"
            f"<label>VERIFICATION CODE, IF ASKED</label><div class='field'>(read from the owner's connected Gmail; never shown anywhere)</div>"
            f"<div class='btn'>Sign in — the owner taps this</div>{steps}</div>"
            f"<div class='sub'>Sandbox/local surface built from PortalCases.doorstep. No live login is claimed; the live session is the owner's own sign-in in his browser lane.</div>"))
        pg.screenshot(path=str(OUT / f"{s['base']}-doorstep-login.png"), full_page=True)
        lines = "".join(f"<div class='step'>{html.escape(t)}</div>" for t in s["ready_lines"])
        pg.set_content(page(
            f"<h1>{html.escape(s['ready_title'])}</h1><div class='box'>"
            f"<span class='badge'>{html.escape(s['state'])}</span>{lines}"
            f"<div class='btn btn-stop'>{'Submit' if s['mode']=='packet' else 'Confirm'} — NOT PRESSED</div>"
            f"<div class='stop'>{html.escape(s['stop'])}</div></div>"
            f"<div class='sub'>Sandbox/local surface built from PortalCases.doorstep. Environment: sandbox doorstep on the guided manual-connect lane; live session pending the owner's browser lane.</div>"))
        pg.screenshot(path=str(OUT / f"{s['base']}-doorstep-ready.png"), full_page=True)
    b.close()
print("rendered", len(items), "doorsteps")
