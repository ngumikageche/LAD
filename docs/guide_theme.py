"""
Shared print styling for the LAD guides.

Both documents are built the same way — a Python script renders one HTML file
and Chrome prints it to A4 — so the look lives here rather than being copied
into each builder. A change made here shows up in every guide on the next
rebuild, which is the point: two documents handed to the same reader should not
disagree about what a callout or a step list looks like.

Each builder appends its own `EXTRA_CSS` for the components only it uses.
"""

from __future__ import annotations

import html


def esc(value: str) -> str:
    """HTML-escape a string for insertion as text content."""
    return html.escape(value, quote=False)


# ── Base stylesheet ──────────────────────────────────────────────────────────
#
# Sizes are in points and millimetres throughout: this is a print stylesheet
# first, and a pixel means nothing on an A4 page.

BASE_CSS = """
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }

  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: "Source Sans 3", "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 10.2pt; line-height: 1.55; color: #1e2433; margin: 0;
  }
  code {
    font-family: "SFMono-Regular", "JetBrains Mono", Consolas, monospace;
    font-size: 0.88em; background: #eef1f7; color: #1b3a6b;
    padding: 0.09em 0.34em; border-radius: 3px; white-space: nowrap;
  }
  pre {
    background: #12182a; color: #dfe6f5; padding: 11px 14px; border-radius: 7px;
    font-family: "SFMono-Regular", "JetBrains Mono", Consolas, monospace;
    font-size: 8.6pt; line-height: 1.5; overflow-x: auto; white-space: pre-wrap;
  }
  pre code { background: none; color: inherit; padding: 0; white-space: pre-wrap; }

  /* ── Cover ── */
  /* Chrome ignores `@page:first`, so rather than fighting the margin box the
     cover is a panel sized to exactly fill it: 297mm less the 18mm top and
     20mm bottom margins. */
  .cover {
    height: 259mm; padding: 30mm 20mm 16mm; border-radius: 4mm;
    page-break-after: always;
    background: linear-gradient(160deg, #0d1b3e 0%, #14345f 55%, #0f4a52 100%);
    color: #fff; display: flex; flex-direction: column;
  }
  .cover .mark {
    font-size: 9pt; letter-spacing: 0.34em; text-transform: uppercase;
    color: #6fe3d0; font-weight: 700;
  }
  .cover h1 { font-size: 34pt; line-height: 1.1; margin: 14mm 0 0; font-weight: 700; }
  .cover .sub { font-size: 13pt; color: #b9cbe6; margin-top: 6mm; max-width: 120mm; }
  .cover .rule { height: 3px; width: 46mm; background: #6fe3d0; margin: 10mm 0; }
  .cover .meta { margin-top: auto; font-size: 9.5pt; color: #9fb6d4; }
  .cover .meta strong { color: #fff; font-weight: 600; }
  .cover .stats { display: flex; gap: 14mm; margin-top: 12mm; }
  .cover .stat .n { font-size: 22pt; font-weight: 700; color: #6fe3d0; }
  .cover .stat .l { font-size: 8.5pt; letter-spacing: 0.13em; text-transform: uppercase; color: #9fb6d4; }

  /* ── Structure ── */
  h2 {
    font-size: 16pt; margin: 0 0 4mm; padding-bottom: 2mm; color: #0d1b3e;
    border-bottom: 2px solid #0d1b3e; page-break-after: avoid;
  }
  h3 { font-size: 11.6pt; margin: 7mm 0 2.5mm; color: #14345f; page-break-after: avoid; }
  h4 { font-size: 10.2pt; margin: 5mm 0 1.5mm; color: #1e2433; page-break-after: avoid; }
  section { page-break-before: always; }
  section.first { page-break-before: avoid; }
  .keep { page-break-inside: avoid; }
  p { margin: 0 0 3mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 5.5mm; }
  li { margin-bottom: 1.4mm; }
  .eyebrow {
    font-size: 8pt; letter-spacing: 0.22em; text-transform: uppercase;
    color: #5b7ba6; font-weight: 700; margin-bottom: 1.5mm;
  }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9.2pt; }
  th {
    background: #0d1b3e; color: #fff; text-align: left; padding: 2mm 2.6mm;
    font-weight: 600; font-size: 8.6pt; letter-spacing: 0.04em;
  }
  td { padding: 1.8mm 2.6mm; border-bottom: 1px solid #dde3ec; vertical-align: top; }
  tbody tr:nth-child(even) { background: #f6f8fb; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }

  /* ── Callouts ── */
  .callout {
    border-left: 4px solid #14345f; background: #f2f6fc; padding: 3mm 4mm;
    margin: 3mm 0 4mm; border-radius: 0 5px 5px 0; page-break-inside: avoid;
  }
  .callout.warn { border-left-color: #c2410c; background: #fdf3ec; }
  .callout.good { border-left-color: #0f766e; background: #eef8f6; }
  .callout .t {
    font-weight: 700; font-size: 8.4pt; letter-spacing: 0.13em;
    text-transform: uppercase; color: #14345f; margin-bottom: 1.2mm;
  }
  .callout.warn .t { color: #c2410c; }
  .callout.good .t { color: #0f766e; }
  .callout p:last-child { margin-bottom: 0; }

  /* ── Side-by-side panels ── */
  .layers { display: flex; gap: 4mm; margin: 4mm 0 5mm; page-break-inside: avoid; }
  .layer { flex: 1; border: 1.5px solid #14345f; border-radius: 7px; padding: 3.5mm 4mm; }
  .layer.two { border-color: #0f766e; }
  .layer .n {
    font-size: 8pt; letter-spacing: 0.18em; text-transform: uppercase;
    font-weight: 700; color: #14345f; margin-bottom: 1.5mm;
  }
  .layer.two .n { color: #0f766e; }
  .layer .q { font-size: 11pt; font-weight: 700; margin-bottom: 2mm; color: #0d1b3e; }
  .layer p { font-size: 9.2pt; margin-bottom: 2mm; }
  .layer .ex { font-size: 8.6pt; color: #5b7ba6; margin-bottom: 0; }

  /* ── Numbered steps ── */
  ol.steps { counter-reset: s; list-style: none; padding-left: 0; margin: 3mm 0 4mm; }
  ol.steps > li {
    counter-increment: s; position: relative; padding-left: 9mm; margin-bottom: 3.2mm;
    page-break-inside: avoid;
  }
  ol.steps > li::before {
    content: counter(s); position: absolute; left: 0; top: 0.2mm;
    width: 6mm; height: 6mm; border-radius: 50%; background: #14345f; color: #fff;
    font-size: 8.4pt; font-weight: 700; display: flex; align-items: center; justify-content: center;
  }

  .count {
    font-size: 8pt; font-weight: 600; color: #5b7ba6; letter-spacing: 0.04em;
    text-transform: none; margin-left: 2mm;
  }

  .toc li { margin-bottom: 1.8mm; font-size: 10pt; }
  .toc .s { color: #5b7ba6; }
"""
