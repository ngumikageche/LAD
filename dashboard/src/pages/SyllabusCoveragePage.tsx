import { useState, useEffect } from 'react';
import { Printer, Plus, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { trainerReportCardsAPI, trainerSubjectsAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';

interface Topic {
  id: string;
  topic: string;
  description: string | null;
  planned_date: string | null;
  covered_date: string | null;
  status: 'covered' | 'pending';
  subject_name: string | null;
}

interface SyllabusReport {
  school: { name: string; location: string };
  trainer_id: string;
  term: { id: string | null; name: string | null };
  topics: Topic[];
  summary: { total: number; covered: number; pending: number; coverage_pct: number };
  generated_at: string;
}

export default function SyllabusCoveragePage() {
  const { user } = useAuth();
  const [data, setData] = useState<SyllabusReport | null>(null);
  const [subjects, setSubjects] = useState<{ id: string; subject_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTopic, setNewTopic] = useState({ topic: '', subject_id: '', planned_date: '', description: '' });
  const [saving, setSaving] = useState(false);

  // Get trainer ID from user object - could be trainer_id, id, or other field
  const trainerId = user?.trainer_id || user?.id;

  const load = async () => {
    if (!trainerId) {
      setLoading(false);
      setError('Trainer ID not available');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await trainerReportCardsAPI.getSyllabus(trainerId) as SyllabusReport;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load syllabus');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [trainerId]);

  useEffect(() => {
    trainerSubjectsAPI.getAssignedSubjects()
      .then(s => setSubjects(Array.isArray(s) ? s : []))
      .catch(() => {});
  }, []);

  const markCovered = async (planId: string) => {
    if (!trainerId) return;
    try {
      await trainerReportCardsAPI.updateSyllabusTopic(trainerId, planId, { mark_covered: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update topic');
    }
  };

  const addTopic = async () => {
    if (!trainerId || !newTopic.topic.trim() || !newTopic.subject_id.trim()) return;
    try {
      setSaving(true);
      await trainerReportCardsAPI.addSyllabusTopic(trainerId, {
        topic: newTopic.topic,
        subject_id: newTopic.subject_id,
        planned_date: newTopic.planned_date || undefined,
        description: newTopic.description || undefined,
      });
      setNewTopic({ topic: '', subject_id: '', planned_date: '', description: '' });
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add topic');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-blue-950">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
        <p className="text-slate-400">Loading syllabus data...</p>
      </div>
    </div>
  );

  if (!trainerId) return (
    <div className="flex items-center justify-center min-h-screen bg-blue-950">
      <div className="text-center text-red-300">
        <p>Trainer ID not available. Please log in again.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-blue-950 p-6 print:bg-slate-900 print:p-0">
      {/* Error Alert */}
      {error && (
        <div className="max-w-4xl mx-auto mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300 print:hidden">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-sm underline">Dismiss</button>
        </div>
      )}

      {/* Toolbar */}
      {data && (
        <div className="max-w-4xl mx-auto mb-4 flex items-center gap-3 print:hidden">
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
            <Plus size={16} /> Add Topic
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition font-medium">
            <Printer size={16} /> Print
          </button>
        </div>
      )}

      {/* Add Topic Form */}
      {showAdd && (
        <div className="max-w-4xl mx-auto mb-4 p-4 bg-slate-900 border border-slate-700 rounded-lg shadow print:hidden">
          <h3 className="font-semibold text-slate-200 mb-3">Add New Topic</h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Topic name *"
              value={newTopic.topic}
              onChange={e => setNewTopic({ ...newTopic, topic: e.target.value })}
              className="px-3 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={newTopic.subject_id}
              onChange={e => setNewTopic({ ...newTopic, subject_id: e.target.value })}
              className="px-3 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select Subject —</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.subject_name}</option>
              ))}
            </select>
            <input
              type="date"
              placeholder="Planned date"
              value={newTopic.planned_date}
              onChange={e => setNewTopic({ ...newTopic, planned_date: e.target.value })}
              className="px-3 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <input
              placeholder="Description (optional)"
              value={newTopic.description}
              onChange={e => setNewTopic({ ...newTopic, description: e.target.value })}
              className="px-3 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addTopic} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Topic'}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {data && (
        <div className="max-w-4xl mx-auto bg-slate-900 shadow-lg print:shadow-none" style={{ padding: '16mm' }}>
          {/* Header */}
          <div className="text-center border-b-2 border-slate-700 pb-4 mb-6">
            <h1 className="text-2xl font-bold text-slate-100 uppercase">{data.school?.name || 'Institution'}</h1>
            <p className="text-sm text-slate-400">{data.school?.location || ''}</p>
            <h2 className="text-lg font-bold text-slate-200 mt-2 uppercase">Syllabus Coverage Tracker</h2>
            {data.term?.name && <p className="text-sm text-slate-400">{data.term.name}</p>}
          </div>

          {/* Progress Bar */}
          {data.summary && (
            <div className="mb-6">
              <div className="flex justify-between text-sm font-medium text-slate-300 mb-1">
                <span>Coverage Progress</span>
                <span>{data.summary.coverage_pct}% ({data.summary.covered}/{data.summary.total} topics)</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-5">
                <div
                  className={`h-5 rounded-full transition-all ${data.summary.coverage_pct >= 80 ? 'bg-green-500' : data.summary.coverage_pct >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                  style={{ width: `${data.summary.coverage_pct}%` }}
                />
              </div>
              <div className="flex gap-6 mt-2 text-xs text-slate-500">
                <span className="text-green-300">✓ Covered: {data.summary.covered}</span>
                <span className="text-amber-300">⚠ Pending: {data.summary.pending}</span>
              </div>
            </div>
          )}

          {/* Topics Table */}
          {!data.topics || data.topics.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No topics added yet for this term.</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Topic</th>
                  <th className="px-3 py-2 text-left">Subject</th>
                  <th className="px-3 py-2 text-center">Planned</th>
                  <th className="px-3 py-2 text-center">Covered</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center print:hidden">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.topics.map((t, i) => (
                  <tr
                    key={t.id}
                    className={`border-b ${t.status === 'pending' ? 'bg-amber-500/10' : i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800'}`}
                  >
                    <td className="px-3 py-2 text-slate-500 text-xs">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-100">
                      <div>{t.topic || '—'}</div>
                      {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                    </td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{t.subject_name || '—'}</td>
                    <td className="px-3 py-2 text-center text-xs text-slate-400">
                      {t.planned_date ? new Date(t.planned_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-slate-400">
                      {t.covered_date ? new Date(t.covered_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {t.status === 'covered'
                        ? <span className="flex items-center justify-center gap-1 text-green-300 text-xs font-medium"><CheckCircle2 size={14} />Done</span>
                        : <span className="flex items-center justify-center gap-1 text-amber-300 text-xs font-medium"><Clock size={14} />Pending</span>}
                    </td>
                    <td className="px-3 py-2 text-center print:hidden">
                      {t.status === 'pending' && (
                        <button
                          onClick={() => markCovered(t.id)}
                          className="px-2 py-1 bg-green-500/15 text-green-300 rounded text-xs hover:bg-green-500/25 transition font-medium"
                        >
                          Mark Done
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="text-xs text-slate-500 text-right mt-4">
            Generated: {new Date(data.generated_at).toLocaleString()}
          </p>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:shadow-none, .print\\:shadow-none * { visibility: visible; }
          .print\\:shadow-none { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
