import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type ExportSheet = { name: string; rows: Record<string, unknown>[] };
export type ExportMeta = { generatedBy: string; reportTitle: string; subtitle?: string };

/** Turns `avg_score_pct` into `Avg Score Pct` so exported headers stay readable. */
export function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function exportExcel(
  sheets: ExportSheet[],
  filename: string,
  meta: ExportMeta
) {
  const wb = XLSX.utils.book_new();

  const coverData = [
    ['CONFIDENTIAL'],
    [meta.reportTitle],
    ...(meta.subtitle ? [[meta.subtitle]] : []),
    [`Downloaded by: ${meta.generatedBy}`],
    [`Date: ${new Date().toLocaleString()}`],
    [],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(coverData), 'Info');

  sheets.forEach(({ name, rows }) => {
    if (rows.length === 0) return;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
  });

  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.csv`;
  a.click();
}

/**
 * Writes one landscape A4 PDF, a table per sheet, with a confidential header on
 * page 1 and page numbers in the footer. Column headers are humanized from the
 * row keys so the same row objects feed Excel, CSV, and PDF unchanged.
 */
export function exportPDF(
  sheets: ExportSheet[],
  filename: string,
  meta: ExportMeta
) {
  const populated = sheets.filter((sheet) => sheet.rows.length > 0);
  if (populated.length === 0) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text('CONFIDENTIAL', pageWidth / 2, 32, { align: 'center' });

  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text(meta.reportTitle, pageWidth / 2, 54, { align: 'center' });

  let cursorY = 72;
  if (meta.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(meta.subtitle, pageWidth / 2, cursorY, { align: 'center' });
    cursorY += 16;
  }

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `Downloaded by ${meta.generatedBy} · ${new Date().toLocaleString()}`,
    pageWidth / 2,
    cursorY,
    { align: 'center' },
  );
  cursorY += 14;

  populated.forEach((sheet, index) => {
    const headers = Object.keys(sheet.rows[0]);
    autoTable(doc, {
      head: [headers.map(humanizeKey)],
      body: sheet.rows.map((row) => headers.map((header) => cellText(row[header]))),
      startY: index === 0 ? cursorY : undefined,
      margin: { top: 48, left: 24, right: 24, bottom: 36 },
      styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [15, 42, 63], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 247, 250] },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.setTextColor(60);
        doc.text(sheet.name, 24, 34);
      },
    });
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 18,
      { align: 'center' },
    );
  }

  doc.save(`${filename}.pdf`);
}
