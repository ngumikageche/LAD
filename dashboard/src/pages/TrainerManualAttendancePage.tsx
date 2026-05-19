import { useEffect, useState, useMemo } from 'react';
import {
  UserCheck, UserX, Search, CheckCircle2, XCircle,
  RefreshCw, ClipboardList, Plus, ChevronDown, ChevronUp,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:5000';

interface Subject { id: string; name: string; code?: string; subject_name?: string; subject_code?: string; course_id?: string; }
interface Course  { id: string; name: string; code?: string; }
interface Session {
  id: string; session_code: string; status: string;
  subject_id: string | null; course_id: string | null;
  started_at: string; expires_at: string; total_checkins?: number;
}
interface StudentRow {
  id: string; code: string | null; registration_number: string;
  name: string; email: string; present: boolean; saved: boolean;
}
interface MarkResult { key: string; status: string; message?: string; student_name?: string; }

export default function TrainerManualAttendancePage() {
  const { token, user } = useAuth();

  // ── data ──────────────────────────────────────────────────────────────────
  const [subjects, setSubjects]   = useState<Subject[]>([]);
  const [courses, setCourses]     = useState<Course[]>([]);
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [students, setStudents]   = useState<StudentRow[]>([]);

  // ── selection ─────────────────────────────────────────────────────────────
  const [subjectId, setSubjectId] = useState('');
  const [courseId, setCourseId]   = useState('');
  const [session, setSession]     = useState<Session | null>(null);

  // ── ui state ──────────────────────────────────────────────────────────────
  const [search, setSearch]           = useState('');
  const [manualCode, setManualCode]   = useState('');
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [creating, setCreating]       = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [results, setResults]         = useState<MarkResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  // ── load subjects + courses ───────────────────────────────────────────────
  useEffect(() => {
    // Admins use /subjects directly; trainers use /trainers/subjects
    const subjectsUrl = user?.user_type === 'admin' || user?.permissions?.['*'] ? '/subjects' : '/trainers/subjects';
    Promise.all([
      apiRequest<Subject[]>(subjectsUrl, { token }),
      apiRequest<Course[]>('/courses', { token }),
    ]).then(([s, c]) => { setSubjects(s); setCourses(c); }).catch(() => {});
  }, [token]);

  // ── load active sessions when subject/course changes ─────────────────────
  useEffect(() => {
    if (!subjectId && !courseId) { setSessions([]); setSession(null); return; }
    apiRequest<Session[]>('/api/v1/attendance/sessions/my', { token })
      .then((all) => {
        const filtered = all.filter((s) =>
          (subjectId && s.subject_id === subjectId) ||
          (courseId  && s.course_id  === courseId)  ||
          (!subjectId && !courseId)
        );
        setSessions(filtered);
        setSession(filtered[0] ?? null);
      })
      .catch(() => setSessions([]));
  }, [subjectId, courseId, token]);

  // ── load enrolled students when session changes ───────────────────────────
  useEffect(() => {
    if (!session) { setStudents([]); return; }
    setLoading(true);
    setError(null);

    const sid = session.subject_id || '';
    const cid = session.course_id  || '';

    Promise.all([
      sid ? apiRequest<{ students: any[] }>(`/subjects/${sid}/students`, { token }).catch(() => ({ students: [] })) : Promise.resolve({ students: [] }),
      apiRequest<{ records: any[] }>(`/api/v1/attendance/sessions/${session.id}/records`, { token }).catch(() => ({ records: [] })),
      cid ? apiRequest<any[]>('/students', { token }).catch(() => []) : Promise.resolve([]),
    ]).then(([subjectData, recordData, allStudents]) => {
      const presentIds = new Set(recordData.records.map((r: any) => r.student_id));

      // Merge subject-enrolled students + course students
      const byId = new Map<string, StudentRow>();
      const addStudent = (s: any) => {
        if (byId.has(s.id)) return;
        byId.set(s.id, {
          id: s.id,
          code: s.code ?? null,
          registration_number: s.registration_number ?? '',
          name: s.user?.name ?? s.name ?? '—',
          email: s.user?.email ?? s.email ?? '',
          present: presentIds.has(s.id),
          saved: presentIds.has(s.id),
        });
      };

      subjectData.students.forEach(addStudent);
      if (cid) allStudents.filter((s: any) => s.course_id === cid).forEach(addStudent);

      setStudents([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
    }).finally(() => setLoading(false));
  }, [session, token]);

  // ── create a new manual session ───────────────────────────────────────────
  const handleCreateSession = async () => {
    if (!subjectId && !courseId) return;
    setCreating(true);
    setError(null);
    try {
      const body: any = {};
      if (subjectId) body.subject_id = subjectId;
      if (courseId)  body.course_id  = courseId;
      const r = await fetch(`${API}/api/v1/attendance/manual-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Failed to create session'); return; }
      const newSession = d.session as Session;
      setSessions((prev) => [newSession, ...prev]);
      setSession(newSession);
    } catch { setError('Network error'); }
    finally { setCreating(false); }
  };

  // ── toggle a student present/absent locally ───────────────────────────────
  const toggle = (id: string) => {
    setStudents((prev) =>
      prev.map((s) => s.id === id ? { ...s, present: !s.present } : s)
    );
  };

  // ── add student by code/reg manually ─────────────────────────────────────
  const handleAddManual = () => {
    const key = manualCode.trim();
    if (!key) return;
    const found = students.find(
      (s) => s.code === key || s.registration_number === key
    );
    if (found) {
      setStudents((prev) => prev.map((s) => s.id === found.id ? { ...s, present: true } : s));
      setManualCode('');
      return;
    }
    // Unknown student — add as pending lookup
    setStudents((prev) => [
      ...prev,
      { id: key, code: key, registration_number: key, name: key, email: '', present: true, saved: false },
    ]);
    setManualCode('');
  };

  // ── save all changes ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!session) return;
    setSaving(true);
    setError(null);
    setResults([]);

    const toMark   = students.filter((s) => s.present && !s.saved).map((s) => s.code ?? s.registration_number);
    const toRemove = students.filter((s) => !s.present && s.saved);

    try {
      const allResults: MarkResult[] = [];

      if (toMark.length > 0) {
        const r = await fetch(`${API}/api/v1/attendance/sessions/${session.id}/manual-checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ students: toMark }),
        });
        const d = await r.json();
        if (!r.ok) { setError(d.error ?? 'Save failed'); return; }
        allResults.push(...(d.results ?? []));
      }

      for (const s of toRemove) {
        const r = await fetch(`${API}/api/v1/attendance/sessions/${session.id}/manual-remove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ student_id: s.code ?? s.registration_number }),
        });
        const d = await r.json();
        allResults.push({ key: s.code ?? s.registration_number, status: r.ok ? 'removed' : 'error', message: d.error });
      }

      // Refresh saved state
      setStudents((prev) => prev.map((s) => ({ ...s, saved: s.present })));
      setResults(allResults);
      setShowResults(true);
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  };

  const filtered = useMemo(() =>
    students.filter((s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.code ?? '').toLowerCase().includes(search.toLowerCase()) ||
      s.registration_number.toLowerCase().includes(search.toLowerCase())
    ), [students, search]);

  const presentCount = students.filter((s) => s.present).length;
  const absentCount  = students.length - presentCount;
  const unsaved      = students.filter((s) => s.present !== s.saved).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-200">Manual Attendance</h1>
        <p className="text-sm text-slate-500 mt-1">
          Mark attendance for students without phones — no QR or GPS required.
        </p>
      </div>

      {/* Session setup */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-200">Step 1 — Select Class</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Subject</label>
            <select
              value={subjectId}
              onChange={(e) => { setSubjectId(e.target.value); setCourseId(''); setSession(null); }}
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select subject —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.subject_code ?? s.code) ? `[${s.subject_code ?? s.code}] ` : ''}{s.subject_name ?? s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Or Course</label>
            <select
              value={courseId}
              onChange={(e) => { setCourseId(e.target.value); setSubjectId(''); setSession(null); }}
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select course —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `[${c.code}] ` : ''}{c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Session picker or create */}
        {(subjectId || courseId) && (
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Session</label>
            {sessions.length > 0 ? (
              <div className="flex gap-3">
                <select
                  value={session?.id ?? ''}
                  onChange={(e) => setSession(sessions.find((s) => s.id === e.target.value) ?? null)}
                  className="flex-1 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.session_code} — {new Date(s.started_at).toLocaleDateString()} [{s.status}]
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleCreateSession}
                  disabled={creating}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition"
                >
                  <Plus size={14} /> New
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-sm text-slate-500">No active sessions found.</p>
                <button
                  onClick={handleCreateSession}
                  disabled={creating}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {creating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  Create Manual Session
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Attendance sheet */}
      {session && (
        <>
          {/* Summary + controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-4">
                <h2 className="text-base font-semibold text-slate-200">
                  Step 2 — Mark Attendance
                </h2>
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1 text-green-300">
                    <UserCheck size={14} /> {presentCount} present
                  </span>
                  <span className="flex items-center gap-1 text-slate-500">
                    <UserX size={14} /> {absentCount} absent
                  </span>
                  <span className="text-slate-600">/ {students.length} total</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStudents((p) => p.map((s) => ({ ...s, present: true })))}
                  className="px-3 py-1.5 text-xs text-green-300 bg-green-500/10 border border-green-500/30 rounded-lg hover:bg-green-500/20 transition"
                >
                  Mark All Present
                </button>
                <button
                  onClick={() => setStudents((p) => p.map((s) => ({ ...s, present: false })))}
                  className="px-3 py-1.5 text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Search + manual add */}
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                <input
                  type="text"
                  placeholder="Search by name, code or reg number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="STU001 or reg no..."
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
                  className="w-44 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleAddManual}
                  className="px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
                  title="Add student by code"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Student list */}
            {loading ? (
              <div className="py-8 text-center text-slate-500 text-sm">Loading students...</div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                {students.length === 0 ? 'No students enrolled in this class.' : 'No students match your search.'}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Student ID</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase hidden md:table-cell">Reg No</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-400 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-400 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filtered.map((s) => (
                      <tr
                        key={s.id}
                        className={`transition-colors ${s.present ? 'bg-green-500/5' : 'hover:bg-slate-800/50'}`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-slate-700 text-indigo-300 px-2 py-0.5 rounded">
                            {s.code ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-200">{s.name}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">{s.registration_number}</td>
                        <td className="px-4 py-3 text-center">
                          {s.present ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-300 bg-green-500/10 px-2 py-0.5 rounded-full">
                              <CheckCircle2 size={12} /> Present
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                              <XCircle size={12} /> Absent
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggle(s.id)}
                            className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                              s.present
                                ? 'text-red-300 bg-red-500/10 hover:bg-red-500/20'
                                : 'text-green-300 bg-green-500/10 hover:bg-green-500/20'
                            }`}
                          >
                            {s.present ? 'Mark Absent' : 'Mark Present'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-4 flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                <XCircle size={16} /> {error}
              </div>
            )}

            {/* Save button */}
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-500">
                {unsaved > 0
                  ? <span className="text-amber-400">{unsaved} unsaved change{unsaved !== 1 ? 's' : ''}</span>
                  : 'All changes saved'}
              </p>
              <button
                onClick={handleSave}
                disabled={saving || unsaved === 0}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
              >
                {saving ? <RefreshCw size={15} className="animate-spin" /> : <ClipboardList size={15} />}
                {saving ? 'Saving...' : `Save Attendance`}
              </button>
            </div>
          </div>

          {/* Save results */}
          {showResults && results.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowResults((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-400" />
                  Save Results ({results.filter((r) => r.status === 'ok' || r.status === 'removed').length} successful)
                </span>
                {showResults ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showResults && (
                <div className="border-t border-slate-800 divide-y divide-slate-800">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <span className="font-mono text-xs text-slate-400">{r.key}</span>
                      <div className="flex items-center gap-2">
                        {r.student_name && <span className="text-slate-300">{r.student_name}</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          r.status === 'ok' ? 'bg-green-500/15 text-green-300' :
                          r.status === 'removed' ? 'bg-slate-700 text-slate-400' :
                          r.status === 'duplicate' ? 'bg-amber-500/15 text-amber-300' :
                          'bg-red-500/15 text-red-300'
                        }`}>
                          {r.status === 'ok' ? 'Marked present' :
                           r.status === 'removed' ? 'Marked absent' :
                           r.status === 'duplicate' ? 'Already marked' :
                           r.message ?? r.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
