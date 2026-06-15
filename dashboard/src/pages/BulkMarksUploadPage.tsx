import { useEffect, useRef, useState } from 'react';
import {
  Upload, Download, CheckCircle2, XCircle, AlertCircle,
  FileText, Send, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiRequest } from '../api/client';

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:5000';

interface Assessment {
  id: string;
  code: string | null;
  name: string;
  assessment_type: string;
  total_marks: number;
  pass_marks: number | null;
  course_id: string | null;
  course_name: string | null;
}

interface PreviewRow {
  row: number;
  student_id: string;
  student_code: string | null;
  student_name: string | null;
  registration_number: string;
  assessment_id: string;
  assessment_code: string | null;
  assessment_name: string | null;
  subject_id: string | null;
  subject_code: string | null;
  subject_name: string | null;
  marks_obtained: number | null;
  total_marks: number | null;
  grade: string | null;
  is_passed: boolean | null;
  term: string | null;
  feedback: string | null;
  errors: string[];
  valid: boolean;
}

interface PreviewResult {
  total: number;
  valid: number;
  invalid: number;
  rows: PreviewRow[];
}

interface CommitResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  batch_id?: string;
  evidence_files?: number;
}

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-teal-500/15 text-teal-300',
  B: 'bg-green-500/15 text-green-300',
  C: 'bg-amber-500/15 text-amber-300',
  D: 'bg-orange-500/15 text-orange-300',
  F: 'bg-red-500/15 text-red-300',
};

export default function BulkMarksUploadPage() {
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [assessmentSearch, setAssessmentSearch] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [examCopies, setExamCopies] = useState<File[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInvalidOnly, setShowInvalidOnly] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  useEffect(() => {
    apiRequest<{ assessments: Assessment[] }>('/scores/bulk-marks/assessments', { token })
      .then((d) => setAssessments(d.assessments))
      .catch(() => {});
  }, [token]);

  const filteredAssessments = assessments.filter((a) =>
    `${a.name} ${a.course_name ?? ''} ${a.assessment_type}`.toLowerCase().includes(assessmentSearch.toLowerCase())
  );

  const handlePreview = async () => {
    if (!file) return;
    setPreviewing(true);
    setError(null);
    setPreview(null);
    setCommitResult(null);

    const fd = new FormData();
    fd.append('file', file);

    try {
      const r = await fetch(`${API}/scores/bulk-marks/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Preview failed'); return; }
      setPreview(d);
    } catch {
      setError('Network error during preview');
    } finally {
      setPreviewing(false);
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    if (examCopies.length === 0) {
      setError('Upload at least one physical exam copy before committing marks.');
      return;
    }
    setCommitting(true);
    setError(null);

    const fd = new FormData();
    fd.append('rows', JSON.stringify(preview.rows));
    examCopies.forEach((copy) => fd.append('exam_copies', copy));

    try {
      const r = await fetch(`${API}/scores/bulk-marks/commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Commit failed'); return; }
      setCommitResult(d);
      setPreview(null);
      setFile(null);
      setExamCopies([]);
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      setError('Network error during commit');
    } finally {
      setCommitting(false);
    }
  };

  const downloadTemplate = () => window.open(`${API}/scores/bulk-marks/template`, '_blank');

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCommitResult(null);
    setError(null);
    setExamCopies([]);
    setSelectedAssessment(null);
    setAssessmentSearch('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const displayRows = preview
    ? (showInvalidOnly ? preview.rows.filter((r) => !r.valid) : preview.rows)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-200">Bulk Marks Upload</h1>
          <p className="text-sm text-slate-500">Upload a CSV using student codes — preview, validate, then commit.</p>
        </div>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition"
        >
          <Download size={15} /> Download Template
        </button>
      </div>

      {/* Step 1 — Assessment picker */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-base font-semibold text-slate-200 mb-1">Step 1 — Select Assessment</h2>
        <p className="text-xs text-slate-500 mb-4">
          Choose the assessment this upload applies to. The assessment ID will be pre-filled in the template.
        </p>

        <div className="flex gap-3 mb-3">
          <input
            type="text"
            placeholder="Search assessments by name or course..."
            value={assessmentSearch}
            onChange={(e) => setAssessmentSearch(e.target.value)}
            className="flex-1 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-800">
          {filteredAssessments.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No assessments found.</p>
          ) : filteredAssessments.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAssessment(a)}
              className={`w-full text-left px-4 py-3 text-sm transition hover:bg-slate-800 ${
                selectedAssessment?.id === a.id ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-xs bg-slate-700 text-indigo-300 px-2 py-0.5 rounded mr-2">
                    {a.code ?? '—'}
                  </span>
                  <span className="font-medium text-slate-200">{a.name}</span>
                  {a.course_name && (
                    <span className="ml-2 text-xs text-slate-500">{a.course_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="px-1.5 py-0.5 bg-slate-700 rounded capitalize">{a.assessment_type}</span>
                  <span>{a.total_marks} marks</span>
                  {selectedAssessment?.id === a.id && (
                    <CheckCircle2 size={14} className="text-indigo-400" />
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-600 font-mono mt-0.5">{a.id}</p>
            </button>
          ))}
        </div>

        {selectedAssessment && (
          <div className="mt-3 flex items-center gap-3 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-sm">
            <CheckCircle2 size={16} className="text-indigo-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-mono text-indigo-300 font-bold mr-2">{selectedAssessment.code}</span>
              <span className="text-slate-200 font-medium">{selectedAssessment.name}</span>
              <span className="text-slate-400 ml-2">— {selectedAssessment.total_marks} marks</span>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(selectedAssessment.code ?? selectedAssessment.id)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-mono shrink-0"
              title="Copy assessment code"
            >
              Copy Code
            </button>
          </div>
        )}
      </div>

      {/* Step 2 — Upload CSV */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-base font-semibold text-slate-200 mb-4">Step 2 — Upload CSV File</h2>

        <div
          className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-500 transition"
          onClick={() => fileRef.current?.click()}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3 text-slate-200">
              <FileText size={22} className="text-indigo-400" />
              <div className="text-left">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          ) : (
            <div className="text-slate-500">
              <Upload size={28} className="mx-auto mb-2 text-slate-600" />
              <p className="text-sm">Click to select a CSV file</p>
              <p className="text-xs mt-1">Required columns: student_id, marks_obtained, assessment_id</p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setCommitResult(null);
              setError(null);
            }}
          />
        </div>

        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-800 p-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-200">Physical Exam Copies *</span>
            <span className="mt-1 block text-xs text-slate-500">
              Attach scanned PDFs, photos, or a ZIP of the original exam scripts before committing marks.
            </span>
            <input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.zip,application/pdf,image/png,image/jpeg,application/zip"
              onChange={(e) => setExamCopies(Array.from(e.target.files ?? []))}
              className="mt-3 block w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-700"
            />
          </label>
          {examCopies.length > 0 && (
            <div className="mt-3 space-y-1">
              {examCopies.map((copy) => (
                <p key={`${copy.name}-${copy.size}`} className="text-xs text-slate-400">
                  {copy.name} ({(copy.size / 1024).toFixed(1)} KB)
                </p>
              ))}
            </div>
          )}
        </div>

        {/* CSV column guide */}
        <div className="mt-4 p-4 bg-slate-800 rounded-lg border border-slate-700">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">CSV Column Reference</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { col: 'student_id', req: true, desc: 'Student code (STU001) or reg number' },
              { col: 'marks_obtained', req: true, desc: 'Numeric score' },
              { col: 'assessment_id', req: true, desc: 'Assessment code (ASM001) from Step 1' },
              { col: 'subject_id', req: false, desc: 'Subject code (SUB001) or UUID' },
              { col: 'term', req: false, desc: 'e.g. Term 1 2026' },
              { col: 'feedback', req: false, desc: 'Text feedback' },
            ].map(({ col, req, desc }) => (
              <div key={col} className="flex items-start gap-1.5">
                <span className={`mt-0.5 text-xs font-bold ${req ? 'text-indigo-400' : 'text-slate-500'}`}>
                  {req ? '*' : '○'}
                </span>
                <div>
                  <p className="text-xs font-mono text-slate-300">{col}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          {selectedAssessment && (
            <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400">
              Selected assessment code for your CSV:{' '}
              <span className="font-mono text-indigo-300 font-bold">{selectedAssessment.code}</span>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={handlePreview}
            disabled={!file || previewing}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {previewing ? <RefreshCw size={15} className="animate-spin" /> : <FileText size={15} />}
            {previewing ? 'Validating...' : 'Preview & Validate'}
          </button>
          {(preview || commitResult || file) && (
            <button
              onClick={reset}
              className="px-4 py-2.5 text-sm text-slate-400 bg-slate-800 rounded-lg hover:bg-slate-700 transition"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Commit result */}
      {commitResult && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={20} className="text-green-400" />
            <h2 className="text-base font-semibold text-slate-200">Upload Complete</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-300">{commitResult.inserted}</p>
              <p className="text-xs text-slate-400 mt-1">New scores inserted</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-300">{commitResult.updated}</p>
              <p className="text-xs text-slate-400 mt-1">Existing scores updated</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-slate-400">{commitResult.skipped}</p>
              <p className="text-xs text-slate-400 mt-1">Rows skipped</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Exam evidence files uploaded: <span className="font-semibold text-slate-200">{commitResult.evidence_files ?? 0}</span>
          </p>
          {commitResult.errors.length > 0 && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-xs font-semibold text-red-300 mb-1">Errors:</p>
              {commitResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-300">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview table — Step 3 */}
      {preview && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {/* Summary bar */}
          <div className="p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h2 className="text-base font-semibold text-slate-200">Step 3 — Review & Commit</h2>
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-green-300">
                  <CheckCircle2 size={14} /> {preview.valid} valid
                </span>
                <span className="flex items-center gap-1 text-red-300">
                  <XCircle size={14} /> {preview.invalid} invalid
                </span>
                <span className="text-slate-500">/ {preview.total} total</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInvalidOnly}
                  onChange={(e) => setShowInvalidOnly(e.target.checked)}
                  className="rounded border-slate-600"
                />
                Show invalid only
              </label>
              <button
                onClick={handleCommit}
                disabled={committing || preview.valid === 0 || examCopies.length === 0}
                className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
              >
                {committing ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                {committing ? 'Committing...' : `Commit ${preview.valid} valid rows`}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase w-10">#</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Student ID</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Student</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Assessment</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Subject</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Marks</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Grade</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Term</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {displayRows.map((row) => (
                  <>
                    <tr
                      key={row.row}
                      className={`transition-colors cursor-pointer ${
                        row.valid ? 'hover:bg-slate-800/60' : 'bg-red-500/5 hover:bg-red-500/10'
                      }`}
                      onClick={() => setExpandedRow(expandedRow === row.row ? null : row.row)}
                    >
                      <td className="px-4 py-3 text-slate-500 text-xs">{row.row}</td>
                      <td className="px-4 py-3">
                        {row.valid
                          ? <CheckCircle2 size={16} className="text-green-400" />
                          : <XCircle size={16} className="text-red-400" />}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-slate-700 text-indigo-300 px-2 py-0.5 rounded">
                          {row.student_code ?? row.student_id}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-200">
                        {row.student_name ?? <span className="text-red-400 text-xs">Not found</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[160px] truncate">
                        {row.assessment_code
                          ? <span className="font-mono bg-slate-700 text-indigo-300 px-1.5 py-0.5 rounded">{row.assessment_code}</span>
                          : null}
                        {' '}{row.assessment_name ?? <span className="text-red-400">Not found</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {row.subject_code
                          ? <span className="font-mono bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{row.subject_code}</span>
                          : row.subject_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-200">
                        {row.marks_obtained != null ? (
                          <span>
                            {row.marks_obtained}
                            {row.total_marks != null && (
                              <span className="text-slate-500 font-normal text-xs"> / {row.total_marks}</span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.grade ? (
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${GRADE_COLORS[row.grade] ?? 'bg-slate-700 text-slate-300'}`}>
                            {row.grade}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{row.term ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {expandedRow === row.row ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>

                    {expandedRow === row.row && (
                      <tr key={`${row.row}-detail`} className="bg-slate-800/40">
                        <td colSpan={10} className="px-6 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <div>
                              <p className="text-slate-500 mb-0.5">Reg Number</p>
                              <p className="text-slate-300 font-mono">{row.registration_number ?? '—'}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-0.5">Pass</p>
                              <p className={row.is_passed ? 'text-green-300' : 'text-red-300'}>
                                {row.is_passed == null ? '—' : row.is_passed ? 'Yes' : 'No'}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-0.5">Feedback</p>
                              <p className="text-slate-300">{row.feedback ?? '—'}</p>
                            </div>
                            {row.errors.length > 0 && (
                              <div>
                                <p className="text-red-400 mb-0.5 font-semibold">Errors</p>
                                {row.errors.map((e, i) => (
                                  <p key={i} className="text-red-300">• {e}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {displayRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-6 py-8 text-center text-slate-500">
                      {showInvalidOnly ? 'No invalid rows — all rows are valid!' : 'No rows to display.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
