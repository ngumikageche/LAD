import { useEffect, useState } from 'react';
import { Download, Upload, UserPlus } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Subject = { id: string; name: string };

export default function TrainerEnrollmentPage() {
  const { token } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [identity, setIdentity] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest<Subject[]>('/api/v1/trainer/subjects', { token })
      .then((items) => {
        setSubjects(items);
        setSubjectId(items[0]?.id ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load subjects'));
  }, [token]);

  const enrollOne = async () => {
    if (!subjectId || !identity.trim()) return;
    try {
      setSaving(true);
      setError('');
      const result = await apiRequest<{ status: string }>('/api/v1/trainer/enrollments', {
        method: 'POST',
        token,
        body: { subject_id: subjectId, student_identity: identity.trim() },
      });
      setMessage(result.status === 'already_enrolled' ? 'Learner is already enrolled.' : 'Learner enrolled successfully.');
      setIdentity('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrollment failed');
    } finally {
      setSaving(false);
    }
  };

  const importList = async () => {
    if (!subjectId || !file) return;
    const body = new FormData();
    body.append('subject_id', subjectId);
    body.append('file', file);
    try {
      setSaving(true);
      setError('');
      const result = await apiRequest<{ enrolled: number; already_enrolled: number; not_found: number }>(
        '/api/v1/trainer/enrollments/import',
        { method: 'POST', token, body },
      );
      setMessage(`Imported: ${result.enrolled}; already enrolled: ${result.already_enrolled}; not found: ${result.not_found}.`);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const blob = await apiRequest<Blob>('/api/v1/trainer/enrollments/template', {
        token,
        responseType: 'blob',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'learner_enrollment_template.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Template download failed');
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-100"><UserPlus className="text-cyan-300" /> Learner Enrollment</h1>
        <p className="mt-2 text-slate-400">Enroll existing institutional learners into subjects assigned to you.</p>
      </header>
      {error ? <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-red-200">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-emerald-200">{message}</div> : null}
      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <label className="block text-sm font-semibold text-slate-300">Assigned subject</label>
        <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white">
          {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input value={identity} onChange={(event) => setIdentity(event.target.value)} placeholder="Registration number or email" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white" />
          <button onClick={enrollOne} disabled={saving || !identity.trim()} className="rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-50">Enroll learner</button>
        </div>
      </section>
      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-bold text-white">Bulk roster import</h2><p className="text-sm text-slate-400">CSV columns: registration_number and/or email.</p></div>
          <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200"><Download size={16} /> Template</button>
        </div>
        <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-5 block w-full text-slate-300" />
        <button onClick={importList} disabled={saving || !file} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-50"><Upload size={16} /> Import learners</button>
      </section>
    </div>
  );
}
