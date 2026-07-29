import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
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

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

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

  const upload = async () => {
    if (!file) return;
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
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
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
    <section className="rounded-2xl border border-cyan-400/20 bg-slate-900 p-5 shadow-lg">
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
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="min-w-0 flex-1 text-sm text-slate-300"
        />
        <button
          type="button"
          onClick={upload}
          disabled={!file || uploading}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 font-bold text-slate-950 disabled:opacity-50"
        >
          <Upload size={16} /> {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
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
