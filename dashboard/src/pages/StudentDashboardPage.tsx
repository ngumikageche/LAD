import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, BookOpen, ChartColumnBig, Sparkles, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import CompetencyHeatmap from '../components/charts/CompetencyHeatmap';
import { AnalyticsHero, AnalyticsMetricTile, AnalyticsNarrative, AnalyticsSection } from '../components/analytics/AnalyticsSurface';
import AttendanceCorrelationChart, { type CorrelationPoint } from '../components/charts/AttendanceCorrelationChart';
import InsightsPanel from '../components/ui/InsightsPanel';
import PortfolioStatusPanel from '../components/ui/PortfolioStatusPanel';
import WidgetHelp from '../components/ui/WidgetHelp';
import { studentApi, type StudentAnnouncement, type StudentAttendanceRecord, type StudentDashboardResponse, type StudentSubject } from '../services/studentApi';
import type { HeatmapCell } from '../services/analyticsApi';
import { loadCachedDashboard, saveCachedDashboard } from '../utils/dashboardCache';

const CACHE_KEY = 'lad.student.dashboard.v2';

const fmtPct = (value: number | null | undefined) => `${Number(value ?? 0).toFixed(1)}%`;

const StudentDashboardPage = () => {
  const [dashboard, setDashboard] = useState<StudentDashboardResponse | null>(null);
  const [subjects, setSubjects] = useState<StudentSubject[]>([]);
  const [announcements, setAnnouncements] = useState<StudentAnnouncement[]>([]);
  const [attendance, setAttendance] = useState<StudentAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const cached = loadCachedDashboard<{
      dashboard: StudentDashboardResponse;
      subjects: StudentSubject[];
      announcements: StudentAnnouncement[];
      attendance: StudentAttendanceRecord[];
    }>(CACHE_KEY);

    if (cached) {
      setDashboard(cached.dashboard);
      setSubjects(cached.subjects);
      setAnnouncements(cached.announcements);
      setAttendance(cached.attendance || []);
      setLoading(false);
    }

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [dashboardRes, subjectsRes, announcementsRes, attendanceRes] = await Promise.all([
          studentApi.getDashboard(),
          studentApi.getSubjects(),
          studentApi.getAnnouncements(1, 5),
          studentApi.getAttendance(),
        ]);

        setDashboard(dashboardRes);
        setSubjects(subjectsRes.items);
        setAnnouncements(announcementsRes.items);
        setAttendance(attendanceRes.records);
        saveCachedDashboard(CACHE_KEY, {
          dashboard: dashboardRes,
          subjects: subjectsRes.items,
          announcements: announcementsRes.items,
          attendance: attendanceRes.records,
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
    () => (dashboard?.subject_performance || []).filter((subject) => subject.average_score < 50),
    [dashboard]
  );

  const strongestSubject = useMemo(
    () => [...(dashboard?.subject_performance || [])].sort((a, b) => b.average_score - a.average_score)[0] ?? null,
    [dashboard]
  );

  const weakestSubject = useMemo(
    () => [...(dashboard?.subject_performance || [])].sort((a, b) => a.average_score - b.average_score)[0] ?? null,
    [dashboard]
  );

  const scoreHeatmapItems = useMemo<HeatmapCell[]>(() => {
    return (dashboard?.subject_performance || []).map((subject) => ({
      student_id: 'me',
      student_name: 'Me',
      competency_id: subject.subject_name,
      competency_name: subject.subject_name,
      score: subject.average_score,
      mastery_level: subject.average_score >= 70 ? 'high' : subject.average_score >= 50 ? 'medium' : 'low',
    }));
  }, [dashboard]);

  const attendanceHeatmapItems = useMemo<HeatmapCell[]>(() => {
    const subjectBuckets = new Map<string, { total: number; present: number }>();

    attendance.forEach((record) => {
      const subjectName = record.subject_name?.trim() || 'General';
      const bucket = subjectBuckets.get(subjectName) || { total: 0, present: 0 };
      bucket.total += 1;
      if (record.status === 'success') {
        bucket.present += 1;
      }
      subjectBuckets.set(subjectName, bucket);
    });

    return Array.from(subjectBuckets.entries()).map(([subjectName, bucket]) => {
      const score = bucket.total > 0 ? (bucket.present / bucket.total) * 100 : 0;
      return {
        student_id: 'me',
        student_name: 'Me',
        competency_id: subjectName,
        competency_name: subjectName,
        score,
        mastery_level: score >= 90 ? 'high' : score >= 75 ? 'medium' : 'low',
      };
    });
  }, [attendance]);

  /**
   * Attendance against marks, one dot per subject the learner is assigned.
   *
   * The shared analytics endpoint plots one dot per learner, which on a
   * learner's own dashboard collapses to a single point — a cohort chart with a
   * cohort of one, and nothing to read a relationship off. Their own subjects
   * are the comparison that means something to them, so the points are built
   * here from the marks and the register they already hold.
   */
  const subjectCorrelation = useMemo(() => {
    const attendanceBySubject = new Map<string, { total: number; present: number }>();
    attendance.forEach((record) => {
      const subjectName = record.subject_name?.trim();
      if (!subjectName) return;
      const bucket = attendanceBySubject.get(subjectName) || { total: 0, present: 0 };
      bucket.total += 1;
      if (record.status === 'success') bucket.present += 1;
      attendanceBySubject.set(subjectName, bucket);
    });

    const plotted: CorrelationPoint[] = [];
    const awaitingAttendance: string[] = [];

    (dashboard?.subject_performance || []).forEach((subject) => {
      const bucket = attendanceBySubject.get(subject.subject_name);
      // A subject with no register cannot be placed on the attendance axis, and
      // pinning it at 0% would read as a learner who never attended — the same
      // reading the integrity flag on this chart is looking for.
      if (!bucket || bucket.total === 0) {
        awaitingAttendance.push(subject.subject_name);
        return;
      }
      plotted.push({
        label: subject.subject_name,
        attendance_rate: (bucket.present / bucket.total) * 100,
        average_score: subject.average_score,
      });
    });

    return { plotted, awaitingAttendance };
  }, [attendance, dashboard]);

  const trendDirection = useMemo(() => {
    const trend = dashboard?.trend || [];
    if (trend.length < 2) {
      return null;
    }
    return trend[trend.length - 1].average_score - trend[0].average_score;
  }, [dashboard]);

  const untermedScores = dashboard?.untermed_scores_count ?? 0;

  const attendanceRate = dashboard?.summary_panel?.attendance_rate ?? 0;
  const masteryRate = dashboard?.summary_panel?.mastery_rate ?? 0;
  // Mastery is graded against competencies, and falls back to marks where a
  // learner's modules carry no competency evidence. Saying which keeps the tile
  // honest: with neither, the rate is not a score of zero but nothing measured,
  // and rendering it as a flat "0.0%" reported a failing learner where there
  // was only missing wiring. The trainer dashboard has always done this.
  const masteryBasis = dashboard?.summary_panel?.mastery_basis ?? 'competency';
  const masteryHelper =
    masteryBasis === 'competency' ? 'Competency cells rated at strong mastery'
    : masteryBasis === 'score' ? 'Subjects you are averaging 75%+ in (no competency data)'
    : 'No competency evidence or marks recorded yet';
  const portfolioRate = dashboard?.summary_panel?.portfolio_completion_rate ?? 0;
  const unreadAlerts = dashboard?.summary_panel?.alerts ?? dashboard?.notifications_summary.unread_count ?? 0;
  const recentScoresCount = dashboard?.recent_scores.length ?? 0;

  const pulseItems = [
    `${fmtPct(dashboard?.average_score)} overall average across ${dashboard?.enrolled_subjects_count ?? 0} enrolled subjects shows your current academic position.`,
    trendDirection === null
      ? untermedScores > 0
        // The common cause, and the one that reads as missing data: the marks
        // are recorded but carry no term, so an axis of terms cannot plot them.
        ? `Trend direction is not established yet: ${untermedScores} recorded mark${untermedScores === 1 ? ' is' : 's are'} not attributed to any term, so they cannot be plotted. Ask your trainer to set the term on those marks.`
        : 'Trend direction is not established yet because there are not enough term records.'
      : trendDirection >= 0
        ? `Your term trend is improving by ${fmtPct(trendDirection)} from the first visible term to the latest one.`
        : `Your term trend has dropped by ${fmtPct(Math.abs(trendDirection))}. Review the recent subject-level declines before they compound.`,
    `${fmtPct(attendanceRate)} attendance and ${fmtPct(portfolioRate)} portfolio completion help explain whether weaker performance is caused by revision gaps, missed classes, or unfinished evidence.`,
  ];

  const actionItems = [
    weakestSubject
      ? `${weakestSubject.subject_name} is your weakest subject at ${fmtPct(weakestSubject.average_score)}. Make it the next revision priority.`
      : 'No weak-subject signal is available yet.',
    lowPerformingSubjects.length > 0
      ? `${lowPerformingSubjects.length} subject${lowPerformingSubjects.length === 1 ? '' : 's'} are below 50%. Focus on those first before spreading effort too widely.`
      : 'No subject is currently below 50%, which means your immediate risk level is contained.',
    unreadAlerts > 0
      ? `${unreadAlerts} unread alert${unreadAlerts === 1 ? '' : 's'} may contain deadline or performance warnings that need action.`
      : 'No unread alerts are pending right now.',
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AnalyticsHero
        eyebrow="Student Dashboard"
        title="Academic Progress Overview"
        description="Understand how your scores, attendance, and portfolio evidence connect so you can decide where to focus next with confidence."
      >
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] px-6 py-4 backdrop-blur">
          <p className="text-sm text-slate-300">Snapshot updated</p>
          <p className="mt-1 text-lg font-semibold text-white">
            {dashboard?.last_updated ? new Date(dashboard.last_updated).toLocaleString() : 'Live'}
          </p>
        </div>
      </AnalyticsHero>

      {error ? (
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AnalyticsMetricTile
          label="Average Score"
          value={fmtPct(dashboard?.average_score)}
          helper={`${recentScoresCount} recent scored records`}
          icon={Sparkles}
          accent="cyan"
        />
        <AnalyticsMetricTile
          label="Enrolled Subjects"
          value={dashboard?.enrolled_subjects_count ?? 0}
          helper="Subjects currently shaping your learning load"
          icon={BookOpen}
          accent="emerald"
        />
        <AnalyticsMetricTile
          label="Mastery Rate"
          value={masteryBasis === 'none' ? '—' : fmtPct(masteryRate)}
          helper={masteryHelper}
          icon={ChartColumnBig}
          accent="amber"
        />
        <AnalyticsMetricTile
          label="Attendance Rate"
          value={fmtPct(attendanceRate)}
          helper={`${attendance.length} attendance records tracked`}
          icon={TrendingUp}
          accent="violet"
        />
        <AnalyticsMetricTile
          label="Unread Alerts"
          value={unreadAlerts}
          helper="Notifications or support warnings awaiting review"
          icon={Bell}
          accent={unreadAlerts > 0 ? 'rose' : 'slate'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <AnalyticsNarrative title="Learning Pulse" items={pulseItems} tone="neutral" />
        <AnalyticsNarrative title="Next Best Actions" items={actionItems} tone={lowPerformingSubjects.length > 0 ? 'warn' : 'good'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <AnalyticsSection
          title="Performance by Term"
          description="See whether your average score is rising, flattening, or slipping across reporting periods."
          action={<WidgetHelp title="Performance by Term" description="Shows how your average score changes over different terms or reporting periods so you can tell whether your performance is improving, stable, or declining." />}
        >
          {(dashboard?.trend || []).length === 0 ? (
            <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-700 text-sm text-slate-500">
              No term data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={dashboard?.trend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="term" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip formatter={(value) => fmtPct(Number(value ?? 0))} />
                <Line
                  type="monotone"
                  dataKey="average_score"
                  stroke="#22d3ee"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#22d3ee' }}
                  name="Average Score"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </AnalyticsSection>

        <AnalyticsSection
          title="Subject Performance Map"
          description="Compare all subjects side by side to spot where your strongest and weakest outcomes sit."
          action={<WidgetHelp title="Subject Performance Map" description="Shows your average score in each subject so you can identify the areas that are strongest and the ones that need more effort." />}
        >
          <div className="mb-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Strongest Subject</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">{strongestSubject?.subject_name ?? 'No data yet'}</p>
              <p className="mt-1 text-sm text-slate-300">
                {strongestSubject ? `${fmtPct(strongestSubject.average_score)} average` : 'Waiting for recorded scores.'}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Needs Attention</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">{weakestSubject?.subject_name ?? 'No data yet'}</p>
              <p className="mt-1 text-sm text-slate-300">
                {weakestSubject ? `${fmtPct(weakestSubject.average_score)} average` : 'Waiting for recorded scores.'}
              </p>
            </div>
          </div>

          {(dashboard?.subject_performance || []).length === 0 ? (
            <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-700 text-sm text-slate-500">
              No subject data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dashboard?.subject_performance || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis dataKey="subject_name" type="category" tick={{ fontSize: 11, fill: '#94a3b8' }} width={110} />
                <Tooltip formatter={(value) => fmtPct(Number(value ?? 0))} />
                <Bar dataKey="average_score" fill="#34d399" radius={[0, 8, 8, 0]} name="Average Score" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </AnalyticsSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <AnalyticsSection
          title="Recent Results"
          description="Your latest assessments, grades, and recorded score entries."
          action={<WidgetHelp title="Recent Results" description="Lists your latest assessment outcomes including subject, assessment, score, grade, and term so you can review what changed most recently." />}
        >
          {(dashboard?.recent_scores.length || 0) === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
              No scores recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-sm text-slate-400">
                    <th className="pb-3">Subject</th>
                    <th className="pb-3">Assessment</th>
                    <th className="pb-3">Term</th>
                    <th className="pb-3">Score</th>
                    <th className="pb-3">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.recent_scores || []).map((score) => (
                    <tr key={score.id} className="border-b border-slate-800 text-sm text-slate-200">
                      <td className="py-3">{score.subject?.name || '—'}</td>
                      <td className="py-3">{score.assessment?.name || 'Direct entry'}</td>
                      <td className="py-3">{score.term || '—'}</td>
                      <td className="py-3 font-semibold">{fmtPct(score.score)}</td>
                      <td className="py-3">{score.grade || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AnalyticsSection>

        <div className="space-y-6">
          <AnalyticsSection
            title="Support Watchlist"
            description="Subjects currently below the preferred performance range."
            action={<WidgetHelp title="Support Watchlist" description="Highlights subjects where your average score is below the preferred performance range so you can focus revision time where it matters most." />}
          >
            {lowPerformingSubjects.length > 0 ? (
              <div className="space-y-3">
                {lowPerformingSubjects.map((item) => (
                  <div key={item.subject_name} className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
                      <div>
                        <p className="font-semibold text-slate-100">{item.subject_name}</p>
                        <p className="mt-1 text-sm text-slate-300">
                          {fmtPct(item.average_score)} across {item.scores_count} score{item.scores_count === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                No subject is currently on the watchlist.
              </div>
            )}
          </AnalyticsSection>

          <AnalyticsSection
            title="Announcements"
            description="Recent notices, support messages, and urgent updates relevant to your learning."
            action={<WidgetHelp title="Announcements" description="Shows recent updates, notices, and urgent communications that may affect your classes, deadlines, or required actions." />}
          >
            <div className="space-y-3">
              {announcements.map((announcement) => (
                <article key={announcement.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-slate-100">{announcement.title}</h3>
                    {announcement.is_important ? (
                      <span className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-200">
                        Important
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{announcement.message}</p>
                </article>
              ))}
              {announcements.length === 0 ? <p className="text-sm text-slate-500">No announcements.</p> : null}
            </div>
          </AnalyticsSection>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AnalyticsSection
          title="Scores Heatmap"
          description="A compact view of your score strength across all recorded subjects."
          action={<WidgetHelp title="Scores Heatmap" description="Uses color-coded cells to show which subjects are strong, developing, or currently weak based on your average scores." />}
        >
          <CompetencyHeatmap items={scoreHeatmapItems} limitRows={1} />
        </AnalyticsSection>

        <AnalyticsSection
          title="Attendance Heatmap"
          description={`Attendance is currently ${fmtPct(attendanceRate)} across recorded sessions.`}
          action={<WidgetHelp title="Attendance Heatmap" description="Uses color-coded cells to show attendance consistency by subject, helping you spot where presence may be affecting outcomes." />}
        >
          {attendanceHeatmapItems.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-700 text-sm text-slate-500">
              No attendance data yet.
            </div>
          ) : (
            <CompetencyHeatmap items={attendanceHeatmapItems} limitRows={1} />
          )}
        </AnalyticsSection>
      </div>

      <AnalyticsSection
        title="Attendance vs Performance by Subject"
        description="Each dot is one of your assigned subjects, plotting the attendance you recorded in it against the marks you earned."
        action={<WidgetHelp title="Attendance vs Performance by Subject" description="Plots each subject you are assigned by your attendance in it and your average score, so you can see which subjects your attendance is holding back rather than judging attendance overall." />}
      >
        <AttendanceCorrelationChart items={subjectCorrelation.plotted} unit="subject" />
        {subjectCorrelation.awaitingAttendance.length > 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            Not plotted, no attendance recorded yet: {subjectCorrelation.awaitingAttendance.join(', ')}.
          </p>
        ) : null}
      </AnalyticsSection>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <AnalyticsSection
          title="Instructional Recommendations"
          description="Rule-based suggestions generated from your score, attendance, and competency patterns."
          action={<WidgetHelp title="Instructional Recommendations" description="Shows suggestions generated from your current performance patterns, such as where to revise more or where support may be useful." />}
        >
          <InsightsPanel items={dashboard?.analytics?.recommendations?.items || []} />
        </AnalyticsSection>

        <AnalyticsSection
          title="Portfolio Tracking"
          description={`Portfolio completion currently sits at ${fmtPct(portfolioRate)}.`}
          action={<WidgetHelp title="Portfolio Tracking" description="Shows how much portfolio evidence or practical documentation has been submitted compared with what is expected." />}
        >
          <PortfolioStatusPanel portfolio={dashboard?.analytics?.portfolio || { items: [], last_updated: '' }} />
        </AnalyticsSection>
      </div>

      <AnalyticsSection
        title="Enrolled Subjects"
        description="Your current subject set, including module and trainer context where available."
        action={<WidgetHelp title="Enrolled Subjects" description="Lists the subjects assigned to you together with supporting module and trainer context." />}
      >
        {subjects.length === 0 ? (
          <p className="text-sm text-slate-500">No subjects enrolled yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {subjects.map((subject) => (
              <article key={subject.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
                <p className="text-lg font-semibold text-slate-100">{subject.name}</p>
                <p className="mt-1 text-sm text-slate-400">{subject.module?.name || 'Unassigned module'}</p>
                <p className="mt-1 text-sm text-slate-500">{subject.course?.name || 'Unmapped course'}</p>
                <p className="mt-4 text-sm text-slate-300">
                  Trainers: {subject.trainers.map((trainer) => trainer.name).filter(Boolean).join(', ') || 'Not assigned'}
                </p>
              </article>
            ))}
          </div>
        )}
      </AnalyticsSection>
    </div>
  );
};

export default StudentDashboardPage;
