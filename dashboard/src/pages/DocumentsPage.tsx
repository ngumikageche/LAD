import { useEffect, useMemo, useState } from 'react';
import { Upload, Trash2, Send, FileText, File, X, AlertCircle, CheckCircle2, Search, Users, Download, Eye } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useTableControls } from '../hooks/useTableControls';
import { TableFooter, SortableTh } from '../components/ui/TableControls';

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:5000';

interface Doc {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploader_name: string | null;
  subject_name: string | null;
  created_at: string | null;
}

interface Subject {
  id: string;
  name: string;
  module_name: string | null;
  course_name: string | null;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string | null) {
  const t = (type ?? '').toLowerCase();
  if (t === 'pdf') return <FileText size={16} className="text-red-400" />;
  if (['doc', 'docx'].includes(t)) return <FileText size={16} className="text-blue-400" />;
  if (['xls', 'xlsx', 'csv'].includes(t)) return <FileText size={16} className="text-green-400" />;
  if (['ppt', 'pptx'].includes(t)) return <FileText size={16} className="text-orange-400" />;
  if (['png', 'jpg', 'jpeg', 'gif'].includes(t)) return <File size={16} className="text-purple-400" />;
  return <File size={16} className="text-slate-400" />;
}

// ── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const url = `${API}${doc.file_url}`;
  const t = (doc.file_type ?? '').toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(t);
  const isPdf = t === 'pdf';
  const canPreview = isImage || isPdf;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {fileIcon(doc.file_type)}
            <p className="text-sm font-medium text-slate-200 truncate">{doc.title}</p>
            <span className="text-xs text-slate-500 shrink-0">{doc.file_name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <a
              href={url}
              download={doc.file_name}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
            >
              <Download size={13} /> Download
            </a>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800">
              <X size={16} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-auto bg-slate-950 flex items-center justify-center p-4">
          {isPdf && (
            <iframe
              src={url}
              className="w-full h-full min-h-[60vh] rounded"
              title={doc.title}
            />
          )}
          {isImage && (
            <img src={url} alt={doc.title} className="max-w-full max-h-[70vh] rounded object-contain" />
          )}
          {!canPreview && (
            <div className="text-center">
              <File size={48} className="mx-auto text-slate-600 mb-4" />
              <p className="text-slate-400 mb-4">Preview not available for .{doc.file_type} files.</p>
              <a
                href={url}
                download={doc.file_name}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
              >
                <Download size={16} /> Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Subject picker shared component ──────────────────────────────────────────

function SubjectSelect({ subjects, value, onChange, placeholder }: {
  subjects: Subject[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="">{placeholder ?? '— Select subject —'}</option>
      {subjects.map(s => (
        <option key={s.id} value={s.id}>
          {s.name}{s.course_name ? ` · ${s.course_name}` : ''}{s.module_name ? ` › ${s.module_name}` : ''}
        </option>
      ))}
    </select>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({ token, isAdmin, onClose, onUploaded }: {
  token: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [target, setTarget] = useState<'subject' | 'student' | 'everyone' | ''>('subject');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  // single-student fields
  const [studentSearch, setStudentSearch] = useState('');
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/documents/subjects`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setSubjects(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (target !== 'student') return;
    if (!studentSearch.trim()) { setStudentOptions([]); return; }
    const tid = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const r = await fetch(`${API}/documents/students?q=${encodeURIComponent(studentSearch)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        setStudentOptions(Array.isArray(d) ? d : []);
      } catch {} finally { setSearchLoading(false); }
    }, 300);
    return () => clearTimeout(tid);
  }, [studentSearch, target, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    if (!isAdmin && target !== 'student' && !subjectId) {
      setError('Please select a subject to send this document to.');
      return;
    }
    if (target === 'student' && !selectedStudent) {
      setError('Please select a student.');
      return;
    }

    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('description', description.trim());
    fd.append('file', file);
    if (subjectId && target !== 'student') fd.append('subject_id', subjectId);

    if (target === 'student') {
      // Upload first (no auto-send), then send-student
      fd.append('target', '');
    } else if (isAdmin) {
      fd.append('target', target);
    }

    try {
      const r = await fetch(`${API}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Upload failed'); return; }

      // If single student, send separately
      if (target === 'student' && selectedStudent) {
        const sr = await fetch(`${API}/documents/${d.id}/send-student`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ student_id: selectedStudent.code ?? selectedStudent.registration_number }),
        });
        const sd = await sr.json();
        if (sr.ok) {
          setResult(`Uploaded and sent to ${selectedStudent.name ?? selectedStudent.registration_number}.`);
        } else {
          setResult(`Uploaded but could not send: ${sd.error ?? 'unknown error'}`);
        }
      } else {
        const sent: number = d.notifications_sent ?? 0;
        setResult(sent > 0 ? `Uploaded and sent to ${sent} student(s).` : 'Uploaded successfully.');
      }
      onUploaded();
    } catch {
      setError('Network error');
    } finally {
      setUploading(false);
    }
  };

  const uploadTargets = isAdmin
    ? (['subject', 'student', 'everyone', ''] as const)
    : (['subject', 'student'] as const);

  const targetLabel: Record<string, string> = {
    subject: 'Subject students',
    student: 'Single student',
    everyone: 'Everyone',
    '': 'No one (save only)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl my-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Upload size={18} className="text-indigo-400" /> Upload Document
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm px-3 py-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300">
              <CheckCircle2 size={16} /> {result}
            </div>
            <button onClick={onClose} className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Title *</label>
              <input
                type="text" required value={title} onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Week 3 Lecture Notes"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
              <textarea
                rows={2} value={description} onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="Optional description..."
              />
            </div>

            {/* Send To — admin sees all options, trainer sees subject + student */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Send To</label>
              <div className="flex flex-wrap gap-3">
                {uploadTargets.map(t => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="upload-target" value={t} checked={target === t}
                      onChange={() => { setTarget(t); setSelectedStudent(null); setStudentSearch(''); setSubjectId(''); }}
                      className="accent-indigo-500" />
                    <span className="text-sm text-slate-300">{targetLabel[t]}</span>
                  </label>
                ))}
              </div>
              {target === 'everyone' && (
                <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                  <Users size={12} /> This will notify all students on the system.
                </p>
              )}
            </div>

            {/* Subject picker */}
            {(target === 'subject') && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Subject {!isAdmin && <span className="text-red-400">*</span>}
                </label>
                <SubjectSelect subjects={subjects} value={subjectId} onChange={setSubjectId}
                  placeholder={isAdmin ? '— All subjects (optional) —' : '— Select your subject —'} />
                {!isAdmin && (
                  <p className="text-xs text-slate-500 mt-1">
                    Document will be automatically sent to all students in this subject.
                  </p>
                )}
              </div>
            )}

            {/* Single student picker */}
            {target === 'student' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">
                  Student <span className="text-red-400">*</span>
                </label>
                {selectedStudent ? (
                  <div className="flex items-center justify-between p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                    <div>
                      <span className="font-mono text-xs bg-slate-700 text-indigo-300 px-2 py-0.5 rounded mr-2">
                        {selectedStudent.code ?? '—'}
                      </span>
                      <span className="text-sm text-slate-200">{selectedStudent.name}</span>
                      <p className="text-xs text-slate-500 mt-0.5">{selectedStudent.registration_number}</p>
                    </div>
                    <button type="button" onClick={() => { setSelectedStudent(null); setStudentSearch(''); }}
                      className="p-1 hover:bg-slate-700 rounded">
                      <X size={14} className="text-slate-400" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search by name, STU001 or reg number..."
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {(studentOptions.length > 0 || searchLoading) && (
                      <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-44 overflow-y-auto">
                        {searchLoading && <p className="px-4 py-2 text-xs text-slate-500">Searching...</p>}
                        {studentOptions.map(s => (
                          <button type="button" key={s.id}
                            onClick={() => { setSelectedStudent(s); setStudentSearch(''); setStudentOptions([]); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-700 transition flex items-center gap-3">
                            <span className="font-mono text-xs bg-slate-700 text-indigo-300 px-2 py-0.5 rounded shrink-0">
                              {s.code ?? '—'}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm text-slate-200 truncate">{s.name}</p>
                              <p className="text-xs text-slate-500">{s.registration_number}</p>
                            </div>
                          </button>
                        ))}
                        {!searchLoading && studentOptions.length === 0 && studentSearch && (
                          <p className="px-4 py-2 text-xs text-slate-500">No students found.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  This document will only be visible to this student.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">File *</label>
              <div
                className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-500 transition"
                onClick={() => document.getElementById('doc-file-input')?.click()}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-slate-200">
                    {fileIcon(file.name.split('.').pop() ?? null)}
                    <span className="text-sm">{file.name}</span>
                    <span className="text-xs text-slate-500">({formatBytes(file.size)})</span>
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm">
                    <Upload size={24} className="mx-auto mb-2 text-slate-600" />
                    Click to select a file
                    <p className="text-xs mt-1">PDF, DOC, XLS, PPT, images, ZIP…</p>
                  </div>
                )}
                <input id="doc-file-input" type="file" className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-slate-300 bg-slate-800 rounded-lg hover:bg-slate-700">
                Cancel
              </button>
              <button type="submit"
                disabled={
                  uploading || !file || !title.trim() ||
                  (target === 'student' && !selectedStudent) ||
                  (!isAdmin && target === 'subject' && !subjectId)
                }
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                <Upload size={14} />
                {uploading ? 'Uploading...' : target === 'student' ? 'Upload & Send to Student' : 'Upload & Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


// ── Send Modal (re-send existing doc) ────────────────────────────────────────

interface StudentOption {
  id: string;
  code: string | null;
  registration_number: string;
  name: string | null;
}

function SendModal({ doc, token, isAdmin, onClose }: {
  doc: Doc;
  token: string | null;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [target, setTarget] = useState<'subject' | 'everyone' | 'student'>('subject');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [studentSearch, setStudentSearch] = useState('');
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/documents/subjects`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setSubjects(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (target !== 'student') return;
    if (!studentSearch.trim()) { setStudentOptions([]); return; }
    const tid = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const r = await fetch(`${API}/documents/students?q=${encodeURIComponent(studentSearch)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        setStudentOptions(Array.isArray(d) ? d : []);
      } catch {} finally { setSearchLoading(false); }
    }, 300);
    return () => clearTimeout(tid);
  }, [studentSearch, target, token]);

  const handleSend = async () => {
    if (target === 'subject' && !subjectId) return;
    if (target === 'student' && !selectedStudent) return;
    setSending(true);
    setResult(null);
    try {
      const url = target === 'student'
        ? `${API}/documents/${doc.id}/send-student`
        : `${API}/documents/${doc.id}/send`;
      const body = target === 'student'
        ? { student_id: selectedStudent!.code ?? selectedStudent!.registration_number }
        : { target, subject_id: subjectId || undefined };
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      setResult({ ok: r.ok, msg: r.ok ? d.message : (d.error ?? 'Failed to send') });
    } catch {
      setResult({ ok: false, msg: 'Network error' });
    } finally {
      setSending(false);
    }
  };

  const targets = isAdmin
    ? (['subject', 'student', 'everyone'] as const)
    : (['subject', 'student'] as const);

  const targetLabel: Record<string, string> = {
    subject: 'Subject students',
    student: 'Single student',
    everyone: 'Everyone',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Send size={18} className="text-indigo-400" /> Send Document
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-slate-800 rounded-lg border border-slate-700">
          <p className="text-sm font-medium text-slate-200">{doc.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{doc.file_name}</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-300 mb-2">Send To</label>
          <div className="flex flex-wrap gap-3">
            {targets.map(t => (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="send-target" value={t} checked={target === t}
                  onChange={() => { setTarget(t); setResult(null); setSelectedStudent(null); setStudentSearch(''); }}
                  className="accent-indigo-500" />
                <span className="text-sm text-slate-300">{targetLabel[t]}</span>
              </label>
            ))}
          </div>
        </div>

        {target === 'subject' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-1">Subject</label>
            {loading ? (
              <p className="text-sm text-slate-400">Loading subjects...</p>
            ) : (
              <SubjectSelect subjects={subjects} value={subjectId} onChange={setSubjectId} />
            )}
          </div>
        )}

        {target === 'student' && (
          <div className="mb-4 space-y-2">
            <label className="block text-sm font-medium text-slate-300">Student</label>
            {selectedStudent ? (
              <div className="flex items-center justify-between p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                <div>
                  <span className="font-mono text-xs bg-slate-700 text-indigo-300 px-2 py-0.5 rounded mr-2">
                    {selectedStudent.code ?? '—'}
                  </span>
                  <span className="text-sm text-slate-200">{selectedStudent.name}</span>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedStudent.registration_number}</p>
                </div>
                <button onClick={() => { setSelectedStudent(null); setStudentSearch(''); }}
                  className="p-1 hover:bg-slate-700 rounded">
                  <X size={14} className="text-slate-400" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by name, STU001 or reg number..."
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {(studentOptions.length > 0 || searchLoading) && (
                  <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {searchLoading && <p className="px-4 py-2 text-xs text-slate-500">Searching...</p>}
                    {studentOptions.map(s => (
                      <button key={s.id}
                        onClick={() => { setSelectedStudent(s); setStudentSearch(''); setStudentOptions([]); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-700 transition flex items-center gap-3">
                        <span className="font-mono text-xs bg-slate-700 text-indigo-300 px-2 py-0.5 rounded shrink-0">
                          {s.code ?? '—'}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm text-slate-200 truncate">{s.name}</p>
                          <p className="text-xs text-slate-500">{s.registration_number}</p>
                        </div>
                      </button>
                    ))}
                    {!searchLoading && studentOptions.length === 0 && studentSearch && (
                      <p className="px-4 py-2 text-xs text-slate-500">No students found.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {target === 'everyone' && (
          <p className="text-xs text-amber-400 mb-4 flex items-center gap-1">
            <Users size={12} /> This will notify all students on the system.
          </p>
        )}

        {result && (
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-4 ${
            result.ok
              ? 'bg-green-500/10 border border-green-500/30 text-green-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          }`}>
            {result.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {result.msg}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-300 bg-slate-800 rounded-lg hover:bg-slate-700">
            {result?.ok ? 'Close' : 'Cancel'}
          </button>
          {!result?.ok && (
            <button onClick={handleSend}
              disabled={
                sending ||
                (target === 'subject' && !subjectId) ||
                (target === 'student' && !selectedStudent)
              }
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
              <Send size={14} />
              {sending ? 'Sending...' : 'Send'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { token, user } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [sendDoc, setSendDoc] = useState<Doc | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const isAdmin = user?.user_type === 'admin' || user?.permissions?.['*'] === true;
  const isStudent = user?.user_type === 'student';
  const canCreate = !isStudent && (user?.permissions?.['documents.create'] || user?.permissions?.['*']);
  const canDelete = !isStudent && (user?.permissions?.['documents.delete'] || user?.permissions?.['*']);

  const loadDocs = async () => {
    setLoading(true);
    setError(null);
    try {
      // Students fetch from their own scoped endpoint
      const url = isStudent
        ? `${API}/api/v1/student/documents`
        : `${API}/documents`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setDocs(Array.isArray(d) ? d : []);
    } catch {
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (token) loadDocs(); }, [token]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return docs.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.file_name.toLowerCase().includes(q) ||
      (d.file_type ?? '').toLowerCase().includes(q) ||
      (d.uploader_name ?? '').toLowerCase().includes(q) ||
      (d.subject_name ?? '').toLowerCase().includes(q)
    );
  }, [docs, search]);

  const tc = useTableControls(filtered);

  const handleDelete = async (doc: Doc) => {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    setDeleting(doc.id);
    try {
      await fetch(`${API}/documents/${doc.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadDocs();
    } catch {
      setError('Failed to delete document');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-200">Documents</h1>
          <p className="text-sm text-slate-500">
            {isStudent
              ? 'Documents shared with you by your trainers.'
              : isAdmin
              ? 'Upload and distribute documents to subjects or all students.'
              : 'Upload documents — they are automatically sent to your subject students.'}
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
            <Upload size={16} /> Upload Document
          </button>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" placeholder="Search documents..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <span className="text-xs text-slate-500">{tc.total} document{tc.total !== 1 ? 's' : ''}</span>
        </div>

        {error && (
          <div className="mx-5 mt-4 flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-slate-500 text-sm">Loading documents...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <SortableTh label="Title" sortKey="title" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Subject" sortKey="subject_name" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="File" sortKey="file_name" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Size" sortKey="file_size" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Uploaded By" sortKey="uploader_name" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Date" sortKey="created_at" sort={tc.sort} onSort={tc.setSort} />
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tc.paged.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-800/60 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-100">{doc.title}</p>
                      {doc.description && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{doc.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{doc.subject_name ?? '—'}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        {fileIcon(doc.file_type)}
                        <span className="text-sm text-slate-300 truncate max-w-[160px]">{doc.file_name}</span>
                        {doc.file_type && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-400 uppercase shrink-0">
                            {doc.file_type}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{formatBytes(doc.file_size)}</td>
                    <td className="px-6 py-4 text-sm text-slate-400">{doc.uploader_name ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {/* Preview & Download — visible to everyone */}
                        <button
                          onClick={() => setPreviewDoc(doc)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-700 rounded-lg hover:bg-slate-600 transition"
                          title="Preview"
                        >
                          <Eye size={12} /> Preview
                        </button>
                        <a
                          href={`${API}${doc.file_url}`}
                          download={doc.file_name}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/25 transition"
                          title="Download"
                        >
                          <Download size={12} /> Download
                        </a>
                        {canCreate && (
                          <button onClick={() => setSendDoc(doc)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-300 bg-teal-500/15 border border-teal-500/30 rounded-lg hover:bg-teal-500/25 transition"
                            title="Re-send to students">
                            <Send size={12} /> Send
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(doc)} disabled={deleting === doc.id}
                            className="p-1.5 text-slate-500 hover:text-red-400 transition disabled:opacity-40" title="Delete">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {tc.paged.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">No documents uploaded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <TableFooter page={tc.page} totalPages={tc.totalPages} total={tc.total} pageSize={tc.pageSize} onPage={tc.setPage} />
      </div>

      {showUpload && (
        <UploadModal token={token} isAdmin={isAdmin} onClose={() => setShowUpload(false)} onUploaded={loadDocs} />
      )}
      {sendDoc && (
        <SendModal doc={sendDoc} token={token} isAdmin={isAdmin} onClose={() => setSendDoc(null)} />
      )}
      {previewDoc && (
        <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}
    </div>
  );
}
