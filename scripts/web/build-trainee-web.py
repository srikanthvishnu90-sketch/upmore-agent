#!/usr/bin/env python3
"""Build the Trainee web app into site/app/ (launch readiness B7, 2026-10-26).

The Vercel project "trainee" serves the repository's site/ directory (its Output Directory; production branch main,
Ignored Build Step `git diff --quiet HEAD^ HEAD -- site/`), so the app is committed there, built, like index.html is for
the Upmore project:

  site/app/index.html   web/trainee/app.html with its CSS and scripts inlined: web/trainee/app.{css,js},
                        src/career-apply-card.js (the chat's card), src/career-approval-card.js and
                        src/career-dashboard.{js,css} (FEATURE 15), src/vendor/supabase-js.min.js (2.117.1)
  site/app/config.js    the project URL and its public anon key (the same pair the Upmore app ships)
  site/app/fonts/       Libre Baskerville (OFL) for headers
  site/app/icon.svg     the tab icon

  python3 scripts/web/build-trainee-web.py           write the files
  python3 scripts/web/build-trainee-web.py --check   exit 1 if the committed files differ from a fresh build
"""
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
WEB, SRC, OUT = ROOT / "web" / "trainee", ROOT / "src", ROOT / "site" / "app"
BACKEND_URL = "https://mrwngntwmnaqrqhupvlt.supabase.co"
ANON_KEY = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yd25nbnR3bW5hcXJxaHVwdmx0Iiwicm9sZSI6ImFub24iLCJpYXQi"
            "OjE3OTAwMzk1MDksImV4cCI6MjEwNTYxNTUwOX0.BZKqFIUdjLU_eLuTQecxsHdhIQu1GprTbZmkAPO6p88")
ICON = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#6B4F7E"/>'
        '<path d="M9 10h14v3h-5.5v12h-3V13H9z" fill="#fff"/></svg>\n')


def script_safe(js: str) -> str:
    # An inline script ends at the first "</script" whatever surrounds it; none of the sources may carry one.
    assert "</script" not in js.lower(), "a source carries </script>, which would end the inline script"
    return js


def build() -> dict:
    page = (WEB / "app.html").read_text()
    dash_css = (SRC / "career-dashboard.css").read_text().replace('url("fonts/libre-baskerville-regular.woff2")', 'url("/app/fonts/libre-baskerville-regular.woff2")')
    parts = {
        "/*__APP_CSS__*/": (WEB / "app.css").read_text(),
        "/*__DASHBOARD_CSS__*/": dash_css,
        "/*__SUPABASE_JS__*/": script_safe((SRC / "vendor" / "supabase-js.min.js").read_text()),
        "/*__APPLY_CARD__*/": script_safe((SRC / "career-apply-card.js").read_text()),
        "/*__APPROVAL_CARDS__*/": script_safe((SRC / "career-approval-card.js").read_text()),
        "/*__DASHBOARD__*/": script_safe((SRC / "career-dashboard.js").read_text()),
        "/*__APP_JS__*/": script_safe((WEB / "app.js").read_text()),
    }
    for marker, content in parts.items():
        assert page.count(marker) == 1, f"{marker} must appear once in web/trainee/app.html"
        page = page.replace(marker, content, 1)
    config = ("// Built by scripts/web/build-trainee-web.py: the Supabase project and its public anon key (row-level security\n"
              "// decides what each signed-in person reads). Never a service key.\n"
              f"window.TRAINEE_CONFIG = Object.freeze({{ backendUrl: {BACKEND_URL!r}, anonKey: {ANON_KEY!r} }});\n").replace("'", '"')
    assert "service_role" not in ANON_KEY and '"role":"anon"' in __import__("base64").urlsafe_b64decode(ANON_KEY.split(".")[1] + "==").decode()
    return {
        "index.html": page.encode(),
        "config.js": config.encode(),
        "icon.svg": ICON.encode(),
        "fonts/libre-baskerville-regular.woff2": (ROOT / "fonts" / "libre-baskerville-regular.woff2").read_bytes(),
        "fonts/libre-baskerville-OFL.txt": (ROOT / "fonts" / "libre-baskerville-OFL.txt").read_bytes(),
    }


def main() -> int:
    files = build()
    if "--check" in sys.argv:
        stale = [n for n, b in files.items() if not (OUT / n).is_file() or (OUT / n).read_bytes() != b]
        extra = [str(p.relative_to(OUT)) for p in OUT.rglob("*") if p.is_file() and str(p.relative_to(OUT)) not in files] if OUT.exists() else []
        if stale or extra:
            print("site/app is not the build of its sources; run python3 scripts/web/build-trainee-web.py")
            for n in stale: print("  differs:", n)
            for n in extra: print("  not built:", n)
            return 1
        print(f"site/app matches its sources ({len(files)} files)")
        return 0
    if OUT.exists(): shutil.rmtree(OUT)
    for n, b in files.items():
        p = OUT / n
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b)
    print(f"built site/app ({len(files)} files, index.html {len(files['index.html'])} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
