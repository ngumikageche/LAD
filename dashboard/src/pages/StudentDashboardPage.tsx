import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, BookOpen, ChartColumnBig, Sparkles } from 'lucide-react';
import { studentApi, type StudentAnnouncement, type StudentDashboardResponse, type StudentPerformance, type StudentSubject } from '../services/studentApi';

const StudentDashboardPage = () => {
  const [dashboard, setDashboard] = useState<StudentDashboardResponse | null>(null);
  const [subjects, setSubjects] = useState<StudentSubject[]>([]);
  const [performance, setPerformance] = useState<StudentPerformance | null>(null);
  const [announcements, setAnnouncements] = useState<StudentAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError('');
        const [dashboardResponse, subjectsResponse, performanceResponse, announcementsResponse] = await Promise.all([
          studentApi.getDashboard(),
          studentApi.getSubjects(),
          studentApi.getPerformance(),
          studentApi.getAnnouncements(1, 5),
        ]);

        setDashboard(dashboardResponse);
        setSubjects(subjectsResponse.items);
        setPerformance(performanceResponse);
        setAnnouncements(announcementsResponse.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const lowPerformingSubjects = useMemo(() => {
    return (performance?.subject_performance || []).filter((item) => item.average_score < 50);
  }, [performance]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_#0f172a,_#1d4ed8_45%,_#bfdbfe_120%)] p-8 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-blue-100">Student Portal</p>
            <h1 className="mt-3 text-4xl font-bold">Your academic snapshot</h1>
            <p className="mt-3 max-w-2xl text-blue-100">
              Track your scores, stay on top of subjects, and catch important alerts early.
            </p>
          </div>
          <div className="rounded-3xl bg-white/10 px-6 py-4 backdrop-blur">
            <p className="text-sm text-blue-100">Current average</p>
            <p className="mt-1 text-4xl font-bold">{(dashboard?.average_score || 0).toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div> : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Average score</p>
            <Sparkles className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900">{(dashboard?.average_score || 0).toFixed(1)}%</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Enrolled subjects</p>
            <BookOpen className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900">{dashboard?.enrolled_subjects_count || 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Recent scores</p>
            <ChartColumnBig className="h-5 w-5 text-amber-600" />
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900">{dashboard?.recent_scores.length || 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Unread alerts</p>
            <Bell className="h-5 w-5 text-rose-600" />
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900">{dashboard?.notifications_summary.unread_count || 0}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Recent results</h2>
              <p className="text-slate-600">Your latest recorded scores and feedback.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                  <th className="pb-3">Subject</th>
                  <th className="pb-3">Assessment</th>
                  <th className="pb-3">Term</th>
                  <th className="pb-3">Score</th>
                  <th className="pb-3">Grade</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.recent_scores || []).map((score) => (
                  <tr key={score.id} className="border-b border-slate-100 text-sm text-slate-700">
                    <td className="py-4">{score.subject?.name || 'Unknown subject'}</td>
                    <td className="py-4">{score.assessment?.name || 'Direct entry'}</td>
                    <td className="py-4">{score.term || 'Unspecified'}</td>
                    <td className="py-4 font-semibold">{score.score.toFixed(1)}%</td>
                    <td className="py-4">{score.grade || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(dashboard?.recent_scores.length || 0) === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
              No scores have been recorded yet.
            </div>
          ) : null}
        </section>

        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-900">Support watchlist</h2>
            <div className="mt-5 space-y-4">
              {lowPerformingSubjects.length > 0 ? (
                lowPerformingSubjects.map((item) => (
                  <div key={item.subject_name} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                      <div>
                        <p className="font-semibold text-slate-900">{item.subject_name}</p>
                        <p className="mt-1 text-sm text-slate-700">
                          Average: {item.average_score.toFixed(1)}% across {item.scores_count} score
                          {item.scores_count === 1 ? '' : 's'}.
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
                  No at-risk subjects right now. Keep going.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-900">Announcements</h2>
            <div className="mt-5 space-y-4">
              {announcements.map((announcement) => (
                <article key={announcement.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-slate-900">{announcement.title}</h3>
                    {announcement.is_important ? (
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                        Important
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{announcement.message}</p>
                </article>
              ))}
              {announcements.length === 0 ? <p className="text-sm text-slate-500">No announcements available.</p> : null}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Enrolled subjects</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => (
            <article key={subject.id} className="rounded-2xl bg-slate-50 p-5">
              <p className="text-lg font-semibold text-slate-900">{subject.name}</p>
              <p className="mt-1 text-sm text-slate-600">{subject.module?.name || 'Unassigned module'}</p>
              <p className="mt-3 text-sm text-slate-700">
                Trainers: {subject.trainers.map((trainer) => trainer.name).filter(Boolean).join(', ') || 'Not assigned'}
              </p>
            </article>
          ))}
        </div>
        {subjects.length === 0 ? <p className="text-sm text-slate-500">No subjects enrolled yet.</p> : null}
      </section>
    </div>
  );
};

export default StudentDashboardPage;
