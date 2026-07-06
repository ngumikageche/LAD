import { useState, useEffect } from 'react';
import { Printer, Plus, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { trainerReportCardsAPI, trainerSubjectsAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';
import {
  ReportActionButton,
  ReportMetricCard,
  ReportNotice,
  ReportPage,
  ReportPrintStyles,
  ReportSectionTitle,
  ReportSurface,
  ReportToolbar,
} from '../components/reports/PremiumReportLayout';

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
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
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
      const result = await trainerReportCardsAPI.getSyllabus(trainerId, selectedSubjectId || undefined) as SyllabusReport;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load syllabus');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [trainerId, selectedSubjectId]);

  useEffect(() => {
    trainerSubjectsAPI.getAssignedSubjects()
      .then(s => setSubjects(Array.isArray(s) ? s : []))
      .catch(() => {});
  }, []);

  const toggleCovered = async (planId: string, covered: boolean) => {
    if (!trainerId) return;
    try {
      await trainerReportCardsAPI.updateSyllabusTopic(
        trainerId,
        planId,
        covered ? { mark_covered: true } : { covered_date: '' },
      );
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
    <ReportPage>
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4" />
          <p className="text-slate-400">Loading syllabus data...</p>
        </div>
      </div>
    </ReportPage>
  );

  if (!trainerId) return (
    <ReportPage>
      <div className="text-center">
        <p className="text-red-300">Trainer ID not available. Please log in again.</p>
      </div>
    </ReportPage>
  );

  return (
    <ReportPage>
      <ReportToolbar
        maxWidth="max-w-4xl"
        title="Syllabus Coverage"
        description="Track covered topics, pending work, and syllabus completion progress with a clearer mobile and print layout."
        eyebrow="Trainer Reports"
      >
        <ReportActionButton onClick={() => setShowAdd(!showAdd)} icon={Plus} variant="primary">
          {showAdd ? 'Close Topic Form' : 'Add Topic'}
        </ReportActionButton>
        <div className="w-full sm:min-w-[240px]">
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Subject Filter
          </label>
          <select
            value={selectedSubjectId}
            onChange={(event) => setSelectedSubjectId(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40 focus:bg-slate-900"
          >
            <option value="">All subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.subject_name}</option>
            ))}
          </select>
        </div>
        <ReportActionButton onClick={() => window.print()} icon={Printer}>
          Print
        </ReportActionButton>
      </ReportToolbar>

      {error ? (
        <div className="mx-auto mb-4 max-w-4xl">
          <ReportNotice icon={AlertCircle} tone="error">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-sm font-medium underline underline-offset-4">Dismiss</button>
            </div>
          </ReportNotice>
        </div>
      ) : null}

      {showAdd ? (
        <div className="mx-auto mb-4 max-w-4xl rounded-[28px] border border-white/10 bg-slate-900/80 p-4 shadow-[0_20px_80px_rgba(2,12,27,0.45)] backdrop-blur print:hidden sm:p-5">
          <h3 className="text-lg font-semibold text-slate-100">Add New Topic</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Topic name *"
              value={newTopic.topic}
              onChange={e => setNewTopic({ ...newTopic, topic: e.target.value })}
              className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40"
            />
            <select
              value={newTopic.subject_id}
              onChange={e => setNewTopic({ ...newTopic, subject_id: e.target.value })}
              className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40"
            >
              <option value="">Select Subject</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.subject_name}</option>
              ))}
            </select>
            <input
              type="date"
              placeholder="Planned date"
              value={newTopic.planned_date}
              onChange={e => setNewTopic({ ...newTopic, planned_date: e.target.value })}
              className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40"
            />
            <input
              placeholder="Description (optional)"
              value={newTopic.description}
              onChange={e => setNewTopic({ ...newTopic, description: e.target.value })}
              className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40"
            />
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <ReportActionButton onClick={addTopic} disabled={saving} variant="success">
              {saving ? 'Saving…' : 'Save Topic'}
            </ReportActionButton>
            <ReportActionButton onClick={() => setShowAdd(false)}>
              Cancel
            </ReportActionButton>
          </div>
        </div>
      ) : null}

      {data ? (
        <ReportSurface maxWidth="max-w-4xl">
          <div className="border-b border-white/10 pb-6 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70">Teaching Delivery</p>
            <h1 className="mt-3 text-2xl font-semibold uppercase tracking-[0.16em] text-white sm:text-3xl">{data.school?.name || 'Institution'}</h1>
            <p className="mt-2 text-sm text-slate-400">{data.school?.location || ''}</p>
            <h2 className="mt-4 text-lg font-semibold uppercase tracking-[0.18em] text-slate-100">Syllabus Coverage</h2>
            {data.term?.name ? <p className="mt-2 text-sm text-slate-400">{data.term.name}</p> : null}
          </div>

          {data.summary ? (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <ReportMetricCard label="Coverage" value={`${data.summary.coverage_pct}%`} accent="cyan" helper={`${data.summary.covered} of ${data.summary.total} topics`} />
                <ReportMetricCard label="Total Topics" value={data.summary.total} accent="slate" />
                <ReportMetricCard label="Covered" value={data.summary.covered} accent="emerald" icon={CheckCircle2} />
                <ReportMetricCard label="Pending" value={data.summary.pending} accent="amber" icon={Clock} />
              </div>

              <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <div className="mb-2 flex flex-col gap-2 text-sm font-medium text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                  <span>Topics Covered</span>
                  <span>{data.summary.coverage_pct}% ({data.summary.covered}/{data.summary.total} topics)</span>
                </div>
                <div className="h-5 w-full rounded-full bg-slate-800">
                  <div
                    className={`h-5 rounded-full transition-all ${data.summary.coverage_pct >= 80 ? 'bg-emerald-500' : data.summary.coverage_pct >= 50 ? 'bg-cyan-500' : 'bg-amber-500'}`}
                    style={{ width: `${data.summary.coverage_pct}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  <span className="text-emerald-300">Covered: {data.summary.covered}</span>
                  <span className="text-amber-300">Pending: {data.summary.pending}</span>
                </div>
              </div>
            </>
          ) : null}

          <div className="mt-6">
            <ReportSectionTitle>Coverage Log</ReportSectionTitle>
            {!data.topics || data.topics.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center text-slate-500">
                No topics added yet for this term.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[28px] border border-white/10">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-800/90 text-white">
                      <th className="px-3 py-3 text-left">#</th>
                      <th className="px-3 py-3 text-left">Topic</th>
                      <th className="px-3 py-3 text-left">Subject</th>
                      <th className="px-3 py-3 text-center">Planned</th>
                      <th className="px-3 py-3 text-center">Covered On</th>
                      <th className="px-3 py-3 text-center">Status</th>
                      <th className="px-3 py-3 text-center print:hidden">Capture</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topics.map((t, i) => (
                      <tr
                        key={t.id}
                        className={`${t.status === 'pending' ? 'bg-amber-500/10' : i % 2 === 0 ? 'bg-slate-950/40' : 'bg-white/[0.02]'}`}
                      >
                        <td className="px-3 py-3 text-xs text-slate-500">{i + 1}</td>
                        <td className="px-3 py-3 font-medium text-slate-100">
                          <div>{t.topic || '—'}</div>
                          {t.description ? <p className="mt-1 text-xs text-slate-500">{t.description}</p> : null}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-400">{t.subject_name || '—'}</td>
                        <td className="px-3 py-3 text-center text-xs text-slate-400">
                          {t.planned_date ? new Date(t.planned_date).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-slate-400">
                          {t.covered_date ? new Date(t.covered_date).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {t.status === 'covered'
                            ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-200"><CheckCircle2 size={14} />Done</span>
                            : <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-200"><Clock size={14} />Pending</span>}
                        </td>
                        <td className="px-3 py-3 text-center print:hidden">
                          <label className="inline-flex items-center justify-center gap-2 text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={t.status === 'covered'}
                              onChange={(event) => toggleCovered(t.id, event.target.checked)}
                              className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                            />
                            Covered
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="mt-5 text-right text-xs text-slate-500">
            Generated: {new Date(data.generated_at).toLocaleString()}
          </p>
        </ReportSurface>
      ) : null}

      <ReportPrintStyles />
    </ReportPage>
  );
}
