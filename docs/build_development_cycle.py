#!/usr/bin/env python3
"""Build the development-cycle PDF from its Markdown source.

Run: python3 docs/build_development_cycle.py
Requires markdown-it-py and Google Chrome or Chromium.
"""

from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from markdown_it import MarkdownIt

from guide_theme import BASE_CSS, esc


DOCS = Path(__file__).resolve().parent
SOURCE = DOCS / "PROTOTYPE-DEVELOPMENT-CYCLE.md"
OUT_HTML = DOCS / "prototype-development-cycle.html"
OUT_PDF = DOCS / "LAD-Prototype-Development-Cycle.pdf"

PRINT_CSS = """
  @page {
    @bottom-left { content: "LAD · Prototype Development Cycle";
      font: 8pt Arial, sans-serif; color: #64748b; }
    @bottom-right { content: counter(page);
      font: 8pt Arial, sans-serif; color: #64748b; }
  }
  h1 { font-size: 24pt; line-height: 1.18; color: #0d1b3e;
       margin: 0 0 7mm; padding-bottom: 5mm; border-bottom: 3px solid #0f766e; }
  p { orphans: 3; widows: 3; }
  p > strong:first-child { color: #14345f; }
  code { white-space: normal; overflow-wrap: anywhere; }
  li { break-inside: avoid; }
  table { table-layout: fixed; font-size: 8.8pt; }
  th:first-child { width: 21%; }
  th:last-child { width: 29%; }
  td { overflow-wrap: anywhere; }
"""


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    # Keep repository references useful in a standalone PDF without embedding
    # machine-specific file URLs. The source Markdown retains clickable links.
    source = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda m: m.group(0) if "://" in m.group(2)
        else f"{m.group(1)} (`{m.group(2)}`)",
        source,
    )
    body = MarkdownIt().enable("table").render(source)
    body = re.sub(r"^<p><strong>(.*?)</strong></p>", r"<h1>\1</h1>", body, count=1)
    OUT_HTML.write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        f"<title>{esc('LAD Prototype Development Cycle')}</title>"
        f"<style>{BASE_CSS}\n{PRINT_CSS}</style></head><body>{body}</body></html>",
        encoding="utf-8",
    )
    chrome = next((path for name in ("google-chrome", "chromium", "chromium-browser")
                   if (path := shutil.which(name))), None)
    if not chrome:
        raise SystemExit(f"Chrome or Chromium is required. HTML saved to {OUT_HTML}")
    with tempfile.TemporaryDirectory(prefix="lad-development-pdf-") as profile:
        subprocess.run([
            chrome, "--headless", "--disable-gpu", "--no-sandbox",
            "--no-pdf-header-footer", f"--user-data-dir={profile}",
            f"--print-to-pdf={OUT_PDF}", OUT_HTML.as_uri(),
        ], check=True, capture_output=True, timeout=60)
    print(f"PDF saved to {OUT_PDF} ({OUT_PDF.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
