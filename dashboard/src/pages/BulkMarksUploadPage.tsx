import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, Download, CheckCircle2, XCircle, AlertCircle,
  FileText, Send, RefreshCw, ChevronDown, ChevronUp, Book, Plus,
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

interface SubjectOption {
  id: string;
  code: string | null;
  name: string;
  module_id: string | null;
  module_name: string | null;
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
  subject?: { id: string; code: string | null; name: string } | null;
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
  const [assessmentLoadError, setAssessmentLoadError] = useState<string | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [assessmentSearch, setAssessmentSearch] = useState('');
  const [showCreateAssessment, setShowCreateAssessment] = useState(false);
  const [newAssessmentName, setNewAssessmentName] = useState('');
  const [newAssessmentType, setNewAssessmentType] = useState('test');
  const [newAssessmentSubjectId, setNewAssessmentSubjectId] = useState('');
  const [newAssessmentTotal, setNewAssessmentTotal] = useState('100');
  const [newAssessmentPass, setNewAssessmentPass] = useState('50');
  const [creatingAssessment, setCreatingAssessment] = useState(false);

  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [subjectScope, setSubjectScope] = useState<'all' | 'trainer'>('all');
  const [selectedSubject, setSelectedSubject] = useState<SubjectOption | null>(null);
  const [subjectSearch, setSubjectSearch] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [examCopies, setExamCopies] = useState<File[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInvalidOnly, setShowInvalidOnly] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  useEffect(() => {
    apiRequest<{ assessments: Assessment[] }>('/scores/bulk-marks/assessments', { token })
      .then((d) => {
        setAssessments(d.assessments);
        setAssessmentLoadError(null);
      })
      .catch((err) => setAssessmentLoadError(err instanceof Error ? err.message : 'Could not load assessments'));
  }, [token]);

  useEffect(() => {
    apiRequest<{ subjects: SubjectOption[]; scope: 'all' | 'trainer' }>('/scores/bulk-marks/subjects', { token })
      .then((d) => {
        setSubjects(d.subjects ?? []);
        setSubjectScope(d.scope ?? 'all');
      })
      .catch(() => setSubjects([]));
  }, [token]);

  const filteredAssessments = assessments.filter((a) =>
    `${a.name} ${a.course_name ?? ''} ${a.assessment_type}`.toLowerCase().includes(assessmentSearch.toLowerCase())
  );

  const filteredSubjects = useMemo(() => {
    const needle = subjectSearch.trim().toLowerCase();
    if (!needle) return subjects;
    return subjects.filter((s) =>
      `${s.code ?? ''} ${s.name} ${s.module_name ?? ''} ${s.course_name ?? ''}`.toLowerCase().includes(needle)
    );
  }, [subjects, subjectSearch]);

  const handleCreateAssessment = async () => {
    const subject = subjects.find((item) => item.id === newAssessmentSubjectId);
    if (!subject || !newAssessmentName.trim()) {
      setError('Enter an assessment name and select a subject.');
      return;
    }
    setCreatingAssessment(true);
    setError(null);
    try {
      const created = await apiRequest<Assessment>('/scores/bulk-marks/assessments', {
        method: 'POST',
        token,
        body: {
          name: newAssessmentName.trim(),
          assessment_type: newAssessmentType,
          subject_code: subject.code ?? subject.id,
          total_marks: Number(newAssessmentTotal),
          pass_marks: Number(newAssessmentPass),
        },
      });
      setAssessments((current) => [...current, created]);
      setSelectedAssessment(created);
      setSelectedSubject(subject);
      setShowCreateAssessment(false);
      setNewAssessmentName('');
      setTemplateNote(`Assessment ${created.code ?? created.id} created. Download the class list next.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the assessment');
    } finally {
      setCreatingAssessment(false);
    }
  };

  const handlePreview = async () => {
    if (!file) return;
    setPreviewing(true);
    setError(null);
    setPreview(null);
    setCommitResult(null);

    const fd = new FormData();
    fd.append('file', file);
    if (selectedSubject?.code) fd.append('subject_code', selectedSubject.code);
    else if (selectedSubject) fd.append('subject_id', selectedSubject.id);

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
    if (selectedSubject?.code) fd.append('subject_code', selectedSubject.code);
    else if (selectedSubject) fd.append('subject_id', selectedSubject.id);
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

  const downloadTemplate = async () => {
    setDownloading(true);
    setError(null);
    setTemplateNote(null);

    const params = new URLSearchParams();
    if (selectedAssessment) params.set('assessment_id', selectedAssessment.code ?? selectedAssessment.id);
    if (selectedSubject?.code) params.set('subject_code', selectedSubject.code);
    else if (selectedSubject) params.set('subject_id', selectedSubject.id);

    try {
      const r = await fetch(`${API}/scores/bulk-marks/template?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? 'Could not download the template');
        return;
      }

      const rows = Number(r.headers.get('X-Template-Rows') ?? 0);
      const prefilled = r.headers.get('X-Template-Prefilled') === '1';
      const filename = /filename=([^;]+)/.exec(r.headers.get('Content-Disposition') ?? '')?.[1]?.trim()
        ?? 'marks_upload_template.xlsx';

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      if (!prefilled) {
        setTemplateNote('Blank template downloaded. Select an assessment first to prefill your class list.');
      } else if (rows === 0) {
        setTemplateNote(
          'No learners matched this assessment — check that they are enrolled in its course'
          + (selectedSubject ? ' and take the selected subject.' : '.'),
        );
      } else {
        setTemplateNote(
          `Template prefilled with ${rows} learner${rows === 1 ? '' : 's'}. Fill in the marks_obtained column and upload it below.`,
        );
      }
    } catch {
      setError('Network error while downloading the template');
    } finally {
      setDownloading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCommitResult(null);
    setError(null);
    setTemplateNote(null);
    setExamCopies([]);
    setSelectedAssessment(null);
    setAssessmentSearch('');
    setSelectedSubject(null);
    setSubjectSearch('');
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
          <p className="text-sm text-slate-500">
            Pick the assessment and subject by code, upload an Excel or CSV file, then preview, validate, and commit.
          </p>
        </div>
        <div className="text-right">
          <button
            onClick={downloadTemplate}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition"
          >
            {downloading ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
            {selectedAssessment ? 'Download Class List' : 'Download Template'}
          </button>
          <p className="mt-1.5 text-xs text-slate-500">
            {selectedAssessment
              ? 'Prefilled with your learners — just add marks'
              : 'Select an assessment to prefill learners'}
          </p>
        </div>
      </div>

      {templateNote && (
        <div className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/70 border border-slate-700 rounded-lg px-4 py-3">
          <FileText size={16} className="text-indigo-400 shrink-0" /> {templateNote}
        </div>
      )}

      {/* Step 1 — Assessment picker */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-200 mb-1">Step 1 — Select Assessment</h2>
            <p className="text-xs text-slate-500">
              Choose an assessment or create one. Its code will be pre-filled in the template.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowCreateAssessment((current) => !current);
              if (!newAssessmentSubjectId && selectedSubject) setNewAssessmentSubjectId(selectedSubject.id);
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={14} /> Create Assessment
          </button>
        </div>

        {showCreateAssessment && (
          <div className="mb-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-400">
                Assessment name
                <input
                  value={newAssessmentName}
                  onChange={(event) => setNewAssessmentName(event.target.value)}
                  placeholder="e.g. CAT 1"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                />
              </label>
              <label className="text-xs text-slate-400">
                Subject
                <select
                  value={newAssessmentSubjectId}
                  onChange={(event) => setNewAssessmentSubjectId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                >
                  <option value="">Select subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.code ?? '—'} — {subject.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Type
                <select
                  value={newAssessmentType}
                  onChange={(event) => setNewAssessmentType(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                >
                  <option value="test">Test</option>
                  <option value="quiz">Quiz</option>
                  <option value="assignment">Assignment</option>
                  <option value="project">Project</option>
                  <option value="practical">Practical</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-400">
                  Total marks
                  <input
                    type="number"
                    min="1"
                    value={newAssessmentTotal}
                    onChange={(event) => setNewAssessmentTotal(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Pass marks
                  <input
                    type="number"
                    min="0"
                    value={newAssessmentPass}
                    onChange={(event) => setNewAssessmentPass(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                  />
                </label>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCreateAssessment}
              disabled={creatingAssessment || subjects.length === 0}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {creatingAssessment ? 'Creating…' : 'Create and Select'}
            </button>
            {subjects.length === 0 && (
              <p className="mt-2 text-xs text-amber-300">No assigned subjects are available for this assessment.</p>
            )}
          </div>
        )}

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
          {assessmentLoadError ? (
            <p className="px-4 py-3 text-sm text-red-300">{assessmentLoadError}</p>
          ) : filteredAssessments.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No assessments found. Use Create Assessment above.</p>
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

      {/* Step 2 — Subject picker (by code) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-base font-semibold text-slate-200 mb-1">Step 2 — Select Subject (optional)</h2>
        <p className="text-xs text-slate-500 mb-4">
          Pick the subject by its code. Every upload row without its own <span className="font-mono">subject_code</span>{' '}
          is filed under this subject.
          {subjectScope === 'trainer' && ' Only subjects assigned to you are listed.'}
        </p>

        <div className="flex gap-3 mb-3">
          <input
            type="text"
            placeholder="Search by subject code (SUB001) or name..."
            value={subjectSearch}
            onChange={(e) => setSubjectSearch(e.target.value)}
            className="flex-1 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {selectedSubject && (
            <button
              onClick={() => setSelectedSubject(null)}
              className="px-4 py-2 text-sm text-slate-400 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition"
            >
              Clear
            </button>
          )}
        </div>

        <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-800">
          {filteredSubjects.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">
              {subjects.length === 0
                ? 'No subjects are available to you.'
                : 'No subjects match that search.'}
            </p>
          ) : filteredSubjects.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSubject(s)}
              className={`w-full text-left px-4 py-3 text-sm transition hover:bg-slate-800 ${
                selectedSubject?.id === s.id ? 'bg-teal-500/10 border-l-2 border-teal-500' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono text-xs bg-slate-700 text-teal-300 px-2 py-0.5 rounded mr-2">
                    {s.code ?? '—'}
                  </span>
                  <span className="font-medium text-slate-200">{s.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
                  {s.course_name && <span className="truncate max-w-[160px]">{s.course_name}</span>}
                  {selectedSubject?.id === s.id && <CheckCircle2 size={14} className="text-teal-400" />}
                </div>
              </div>
            </button>
          ))}
        </div>

        {selectedSubject && (
          <div className="mt-3 flex items-center gap-3 p-3 bg-teal-500/10 border border-teal-500/30 rounded-lg text-sm">
            <Book size={16} className="text-teal-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-mono text-teal-300 font-bold mr-2">{selectedSubject.code}</span>
              <span className="text-slate-200 font-medium">{selectedSubject.name}</span>
              <span className="text-slate-400 ml-2">— applied to every row without its own subject</span>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(selectedSubject.code ?? selectedSubject.id)}
              className="text-xs text-teal-400 hover:text-teal-300 font-mono shrink-0"
              title="Copy subject code"
            >
              Copy Code
            </button>
          </div>
        )}
      </div>

      {/* Step 3 — Upload Excel or CSV */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-base font-semibold text-slate-200 mb-4">Step 3 — Upload Marks File</h2>

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
              <p className="text-sm">Click to select an Excel or CSV file</p>
              <p className="text-xs mt-1">
                Upload the Excel class list from Step 1, or a CSV with student_id, marks_obtained, assessment_code
              </p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
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

        {/* Upload column guide */}
        <div className="mt-4 p-4 bg-slate-800 rounded-lg border border-slate-700">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Upload Column Reference</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { col: 'student_id', req: true, desc: 'Student code (STU001) or reg number' },
              { col: 'student_name', req: false, desc: 'Prefilled for reference — ignored on upload' },
              { col: 'marks_obtained', req: true, desc: 'Numeric score — the column you fill in' },
              { col: 'assessment_code', req: true, desc: 'Assessment code (ASM001) — auto-filled in Class List' },
              { col: 'subject_code', req: false, desc: 'Subject code (SUB001) — auto-filled in Class List' },
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
          {(selectedAssessment || selectedSubject) && (
            <div className="mt-3 pt-3 border-t border-slate-700 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
              {selectedAssessment && (
                <span>
                  Assessment code exported in your Class List:{' '}
                  <span className="font-mono text-indigo-300 font-bold">{selectedAssessment.code ?? selectedAssessment.id}</span>
                </span>
              )}
              {selectedSubject && (
                <span>
                  Subject applied to this batch:{' '}
                  <span className="font-mono text-teal-300 font-bold">{selectedSubject.code}</span>
                </span>
              )}
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
            {commitResult.subject ? (
              <>
                {' • '}Subject:{' '}
                <span className="font-mono font-semibold text-teal-300">{commitResult.subject.code}</span>{' '}
                <span className="text-slate-300">{commitResult.subject.name}</span>
              </>
            ) : null}
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
              <h2 className="text-base font-semibold text-slate-200">Step 4 — Review & Commit</h2>
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
