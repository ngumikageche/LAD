import { useRef, useState, type ChangeEvent } from 'react';
import { Download, FileSpreadsheet, Save, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

type ImportRow = {
  row: number;
  status: 'created' | 'duplicate' | 'failed';
  email?: string;
  registration_number?: string;
  staff_number?: string;
  initial_password?: string;
  message?: string;
};

type ImportResult = {
  total_rows: number;
  created: number;
  duplicates: number;
  failed: number;
  results: ImportRow[];
};

type Props = {
  personLabel: 'learners' | 'trainers';
  uploadPath: string;
  templatePath: string;
  templateFilename: string;
  requiredColumns: string;
  onComplete?: () => void | Promise<void>;
};

type WorkbookPreview = {
  sheetName: string;
  rows: string[][];
  columnCount: number;
};

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const displayCell = (value: unknown) => String(value ?? '');

export default function BulkPeopleUploadPanel({
  personLabel,
  uploadPath,
  templatePath,
  templateFilename,
  requiredColumns,
  onComplete,
}: Props) {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<WorkbookPreview | null>(null);

  const downloadTemplate = async () => {
    try {
      setError('');
      const blob = await apiRequest<Blob>(templatePath, { token, responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = templateFilename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Template download failed');
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const loadPreview = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    setFile(null);
    setPreview(null);
    setResult(null);
    setError('');
    if (!selectedFile) return;

    try {
      setPreviewing(true);
      const workbook = XLSX.read(await selectedFile.arrayBuffer(), {
        type: 'array',
        cellDates: true,
      });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('The workbook does not contain a worksheet');
      const values = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
        raw: false,
      });
      const rows = values
        .map((row) => row.map(displayCell))
        .filter((row) => row.some((cell) => cell.trim() !== ''));
      if (rows.length === 0) throw new Error('The selected file is empty');
      const columnCount = Math.max(...rows.map((row) => row.length));
      setFile(selectedFile);
      setPreview({ sheetName, rows, columnCount });
    } catch (err) {
      event.target.value = '';
      setError(err instanceof Error ? err.message : 'The selected spreadsheet could not be read');
    } finally {
      setPreviewing(false);
    }
  };

  const upload = async () => {
    if (!file || !preview) return;
    const body = new FormData();
    body.append('file', file);
    try {
      setUploading(true);
      setError('');
      setResult(null);
      const response = await apiRequest<ImportResult>(uploadPath, {
        method: 'POST',
        token,
        body,
      });
      setResult(response);
      clearFile();
      await onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to import ${personLabel}`);
    } finally {
      setUploading(false);
    }
  };

  const downloadResults = () => {
    if (!result) return;
    const rows = [
      ['Row', 'Status', 'Registration/Staff No', 'Email', 'Initial Password', 'Message'],
      ...result.results.map((item) => [
        item.row,
        item.status,
        item.registration_number ?? item.staff_number ?? '',
        item.email ?? '',
        item.initial_password ?? '',
        item.message ?? '',
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${personLabel}-import-results.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-lg border border-cyan-400/20 bg-slate-900 p-5 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
            <FileSpreadsheet className="text-cyan-300" size={20} />
            Bulk upload {personLabel}
          </h2>
          <p className="mt-1 text-sm text-slate-400">CSV or XLSX · {requiredColumns}</p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          <Download size={16} /> Our template
        </button>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={loadPreview}
          className="min-w-0 flex-1 text-sm text-slate-300"
        />
        {file ? (
          <button
            type="button"
            onClick={clearFile}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
            title="Clear selected file"
            aria-label="Clear selected file"
          >
            <X size={17} />
          </button>
        ) : null}
      </div>
      {previewing ? <p className="mt-3 text-sm text-slate-400">Loading spreadsheet preview...</p> : null}
      {preview ? (
        <div className="mt-5 overflow-hidden rounded-md border border-slate-700 bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">{file?.name}</p>
              <p className="text-xs text-slate-400">
                {preview.sheetName} · {Math.max(preview.rows.length - 1, 0)} data rows · {preview.columnCount} columns
              </p>
            </div>
            <button
              type="button"
              onClick={upload}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-md bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
            >
              <Save size={16} /> {uploading ? 'Saving...' : `Save ${Math.max(preview.rows.length - 1, 0)} ${personLabel}`}
            </button>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="min-w-max border-separate border-spacing-0 text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-800">
                <tr>
                  <th className="sticky left-0 z-20 w-12 border-b border-r border-slate-600 bg-slate-800 px-3 py-2 text-center text-xs font-semibold text-slate-400">
                    #
                  </th>
                  {Array.from({ length: preview.columnCount }, (_, columnIndex) => (
                    <th
                      key={columnIndex}
                      className="min-w-40 border-b border-r border-slate-600 px-3 py-2 font-semibold text-cyan-100"
                    >
                      {preview.rows[0]?.[columnIndex] || `Column ${columnIndex + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(1).map((row, rowIndex) => (
                  <tr key={rowIndex} className="odd:bg-slate-950 even:bg-slate-900/70">
                    <th className="sticky left-0 border-b border-r border-slate-700 bg-slate-900 px-3 py-2 text-center text-xs font-normal text-slate-500">
                      {rowIndex + 2}
                    </th>
                    {Array.from({ length: preview.columnCount }, (_, columnIndex) => (
                      <td
                        key={columnIndex}
                        className="max-w-80 border-b border-r border-slate-800 px-3 py-2 text-slate-300"
                      >
                        {row[columnIndex] || <span className="text-slate-700">empty</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
      {result ? (
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4">
          <p className="text-sm text-slate-200">
            {result.created} created · {result.duplicates} duplicates · {result.failed} failed
          </p>
          <p className="mt-1 text-xs text-amber-300">
            Initial passwords are shown only in this result. Download and store the file securely.
          </p>
          <button
            type="button"
            onClick={downloadResults}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
          >
            <Download size={15} /> Download results and passwords
          </button>
        </div>
      ) : null}
    </section>
  );
}
