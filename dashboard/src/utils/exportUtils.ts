import * as XLSX from 'xlsx';

export function exportExcel(
  sheets: Array<{ name: string; rows: Record<string, unknown>[] }>,
  filename: string,
  meta: { generatedBy: string; reportTitle: string }
) {
  const wb = XLSX.utils.book_new();

  const coverData = [
    ['CONFIDENTIAL'],
    [meta.reportTitle],
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
