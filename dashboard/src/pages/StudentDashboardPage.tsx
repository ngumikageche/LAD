import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, BookOpen, ChartColumnBig, Sparkles, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { studentApi, type StudentAnnouncement, type StudentDashboardResponse, type StudentSubject } from '../services/studentApi';
import CompetencyHeatmap from '../components/charts/CompetencyHeatmap';
import AttendanceCorrelationChart from '../components/charts/AttendanceCorrelationChart';
import InsightsPanel from '../components/ui/InsightsPanel';
import PortfolioStatusPanel from '../components/ui/PortfolioStatusPanel';
import WidgetHelp from '../components/ui/WidgetHelp';
import { loadCachedDashboard, saveCachedDashboard } from '../utils/dashboardCache';

const CACHE_KEY = 'lad.student.dashboard.v2';

const StudentDashboardPage = () => {
  const [dashboard, setDashboard] = useState<StudentDashboardResponse | null>(null);
  const [subjects, setSubjects] = useState<StudentSubject[]>([]);
  const [announcements, setAnnouncements] = useState<StudentAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const cached = loadCachedDashboard<{
      dashboard: StudentDashboardResponse;
      subjects: StudentSubject[];
      announcements: StudentAnnouncement[];
    }>(CACHE_KEY);
    if (cached) {
      setDashboard(cached.dashboard);
      setSubjects(cached.subjects);
      setAnnouncements(cached.announcements);
      setLoading(false);
    }

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [dashboardRes, subjectsRes, announcementsRes] = await Promise.all([
          studentApi.getDashboard(),
          studentApi.getSubjects(),
          studentApi.getAnnouncements(1, 5),
        ]);
        setDashboard(dashboardRes);
        setSubjects(subjectsRes.items);
        setAnnouncements(announcementsRes.items);
        saveCachedDashboard(CACHE_KEY, {
          dashboard: dashboardRes,
          subjects: subjectsRes.items,
          announcements: announcementsRes.items,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const lowPerformingSubjects = useMemo(
    () => (dashboard?.subject_performance || []).filter((s) => s.average_score < 50),
    [dashboard]
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-slate-700" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_#0f172a,_#1d4ed8_45%,_#bfdbfe_120%)] p-8 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-blue-100">Student Portal</p>
            <h1 className="mt-3 text-4xl font-bold">Your academic snapshot</h1>
            <p className="mt-3 max-w-2xl text-blue-100">
              Track your scores, stay on top of subjects, and catch important alerts early.
            </p>
          </div>
          <div className="rounded-3xl bg-slate-900/10 px-6 py-4 backdrop-blur">
            <p className="text-sm text-blue-100">Current average</p>
            <p className="mt-1 text-4xl font-bold">{(dashboard?.average_score || 0).toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>}

      {/* KPI Cards */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Average score', value: `${(dashboard?.average_score || 0).toFixed(1)}%`, icon: Sparkles, color: 'text-indigo-400', description: 'Shows your mean score across recorded assessments. Higher values indicate stronger overall performance.' },
          { label: 'Enrolled subjects', value: dashboard?.enrolled_subjects_count ?? 0, icon: BookOpen, color: 'text-emerald-600', description: 'Shows how many subjects are currently attached to your learning plan or registration.' },
          { label: 'Mastery rate', value: `${dashboard?.summary_panel?.mastery_rate?.toFixed(1) ?? '0.0'}%`, icon: ChartColumnBig, color: 'text-amber-600', description: 'Shows the share of competency cells marked as high mastery. It summarizes how consistently you are meeting competency expectations.' },
          { label: 'Unread alerts', value: dashboard?.summary_panel?.alerts ?? dashboard?.notifications_summary.unread_count ?? 0, icon: Bell, color: 'text-rose-600', description: 'Shows how many warnings, support flags, or unread learning alerts need your attention.' },
        ].map(({ label, value, icon: Icon, color, description }) => (
          <div key={label} className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <WidgetHelp title={label} description={description} />
              </div>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <p className="mt-4 text-3xl font-bold text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Trend Chart + At-Risk */}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        {/* Performance trend by term */}
        <div className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-400" />
              <h2 className="text-xl font-semibold text-slate-100">Performance by Term</h2>
            </div>
            <WidgetHelp title="Performance by Term" description="Shows how your average score changes over different terms or reporting periods. Use it to see whether performance is improving, stable, or declining over time." />
          </div>
          {(dashboard?.trend || []).length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-slate-400">
              No term data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dashboard?.trend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="term" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => `${Number(v ?? 0).toFixed(1)}%`} />
                <Line type="monotone" dataKey="average_score" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} name="Avg Score" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Subject performance bars */}
        <div className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-100">By Subject</h2>
            <WidgetHelp title="By Subject" description="Shows your average score in each subject. It helps you spot stronger areas and subjects that may need extra support." />
          </div>
          {(dashboard?.subject_performance || []).length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-slate-400">
              No subject data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dashboard?.subject_performance || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis dataKey="subject_name" type="category" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={(v) => `${Number(v ?? 0).toFixed(1)}%`} />
                <Bar dataKey="average_score" fill="#10b981" name="Avg Score" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent scores + watchlist */}
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="mb-1 text-2xl font-semibold text-slate-100">Recent results</h2>
              <p className="text-slate-600">Your latest recorded scores and feedback.</p>
            </div>
            <WidgetHelp title="Recent results" description="Lists your newest assessment outcomes, including subject, assessment name, term, score, and grade." />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-slate-700 text-left text-sm text-slate-500">
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
                    <td className="py-3">{score.subject?.name || '—'}</td>
                    <td className="py-3">{score.assessment?.name || 'Direct entry'}</td>
                    <td className="py-3">{score.term || '—'}</td>
                    <td className="py-3 font-semibold">{score.score.toFixed(1)}%</td>
                    <td className="py-3">{score.grade || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(dashboard?.recent_scores.length || 0) === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
              No scores recorded yet.
            </div>
          )}
        </section>

        <section className="space-y-6">
          {/* At-risk watchlist */}
          <div className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-100">Support watchlist</h2>
              <WidgetHelp title="Support watchlist" description="Highlights subjects where your average score is currently below the preferred performance range, so you can focus your revision effort." />
            </div>
            {lowPerformingSubjects.length > 0 ? (
              <div className="space-y-3">
                {lowPerformingSubjects.map((item) => (
                  <div key={item.subject_name} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
                      <div>
                        <p className="font-semibold text-slate-100">{item.subject_name}</p>
                        <p className="mt-1 text-sm text-slate-700">
                          Average: {item.average_score.toFixed(1)}% across {item.scores_count} score{item.scores_count === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
                No at-risk subjects right now. Keep going.
              </div>
            )}
          </div>

          {/* Announcements */}
          <div className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-100">Announcements</h2>
              <WidgetHelp title="Announcements" description="Shows recent updates, notices, and urgent communications relevant to your classes or learning environment." />
            </div>
            <div className="space-y-3">
              {announcements.map((a) => (
                <article key={a.id} className="rounded-2xl border border-slate-700 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-slate-100">{a.title}</h3>
                    {a.is_important && (
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">Important</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{a.message}</p>
                </article>
              ))}
              {announcements.length === 0 && <p className="text-sm text-slate-500">No announcements.</p>}
            </div>
          </div>
        </section>
      </div>

      {/* Enrolled subjects */}
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-slate-100">Competency Heatmap</h2>
              <p className="text-sm text-slate-600">A quick view of strengths and remediation areas.</p>
            </div>
            <div className="flex items-center gap-3">
              <WidgetHelp title="Competency Heatmap" description="Shows your competency performance using color-coded cells. Red means low mastery, yellow means developing, and green means strong mastery." />
              <span className="text-xs text-slate-400">Updated {dashboard?.last_updated ? new Date(dashboard.last_updated).toLocaleString() : 'recently'}</span>
            </div>
          </div>
          <CompetencyHeatmap items={dashboard?.analytics?.heatmap?.items || []} limitRows={1} />
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-slate-100">Learning Signals</h2>
              <p className="text-sm text-slate-600">
                Attendance rate {dashboard?.summary_panel?.attendance_rate?.toFixed(1) ?? '0.0'}% and portfolio completion {dashboard?.summary_panel?.portfolio_completion_rate?.toFixed(1) ?? '0.0'}%.
              </p>
            </div>
            <WidgetHelp title="Learning Signals" description="Shows the relationship between attendance and academic performance. It helps you see whether stronger attendance aligns with stronger scores." />
          </div>
          <AttendanceCorrelationChart items={dashboard?.analytics?.attendance_correlation?.items || []} />
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold text-slate-100">Instructional Recommendations</h2>
            <WidgetHelp title="Instructional Recommendations" description="Shows rule-based suggestions generated from your competency and risk patterns, such as areas that need extra revision or support." />
          </div>
          <InsightsPanel items={dashboard?.analytics?.recommendations?.items || []} />
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold text-slate-100">Portfolio Tracking</h2>
            <WidgetHelp title="Portfolio Tracking" description="Shows how much evidence or portfolio work has been submitted compared with what is expected for the tracked competencies." />
          </div>
          <PortfolioStatusPanel portfolio={dashboard?.analytics?.portfolio || { items: [], last_updated: '' }} />
        </section>
      </div>

      <section className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-slate-100">Enrolled subjects</h2>
          <WidgetHelp title="Enrolled subjects" description="Lists the subjects currently assigned to you, along with module and trainer context where available." />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => (
            <article key={subject.id} className="rounded-2xl bg-slate-800 p-5">
              <p className="text-lg font-semibold text-slate-100">{subject.name}</p>
              <p className="mt-1 text-sm text-slate-600">{subject.module?.name || 'Unassigned module'}</p>
              <p className="mt-3 text-sm text-slate-700">
                Trainers: {subject.trainers.map((t) => t.name).filter(Boolean).join(', ') || 'Not assigned'}
              </p>
            </article>
          ))}
        </div>
        {subjects.length === 0 && <p className="text-sm text-slate-500">No subjects enrolled yet.</p>}
      </section>
    </div>
  );
};

export default StudentDashboardPage;
