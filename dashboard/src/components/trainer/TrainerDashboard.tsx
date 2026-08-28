import { useEffect, useMemo, useState } from 'react';
import { Activity, BookOpen, ClipboardList, ShieldAlert, Users } from 'lucide-react';
import ScoreForm from './ScoreForm';
import ScoresTable from './ScoresTable';
import { trainerApi, type AtRiskStudent, type TrainerDashboardResponse, type TrainerSubject } from '../../services/trainerApi';
import CompetencyHeatmap from '../charts/CompetencyHeatmap';
import AttendanceCorrelationChart from '../charts/AttendanceCorrelationChart';
import CohortComparisonChart from '../charts/CohortComparisonChart';
import InsightsPanel from '../ui/InsightsPanel';
import PortfolioStatusPanel from '../ui/PortfolioStatusPanel';
import WidgetHelp from '../ui/WidgetHelp';
import { loadCachedDashboard, saveCachedDashboard } from '../../utils/dashboardCache';
import type { CohortComparisonResponse } from '../../services/analyticsApi';
import { AnalyticsHero, AnalyticsMetricTile, AnalyticsNarrative, AnalyticsSection } from '../analytics/AnalyticsSurface';
import { useNavigate } from 'react-router-dom';

const CACHE_KEY = 'lad.trainer.dashboard.v2';

const fmtPct = (value: number | null | undefined) => `${Number(value ?? 0).toFixed(1)}%`;

const TrainerDashboard = () => {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<TrainerDashboardResponse | null>(null);
  const [subjects, setSubjects] = useState<TrainerSubject[]>([]);
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [comparison, setComparison] = useState<CohortComparisonResponse | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [dashboardData, subjectData, atRiskData] = await Promise.all([
        trainerApi.getDashboard(selectedSubjectId || undefined),
        trainerApi.getSubjects(),
        trainerApi.getAtRiskStudents(selectedSubjectId || undefined),
      ]);
      setDashboard(dashboardData);
      setSubjects(subjectData);
      setAtRiskStudents(atRiskData);
      const nextComparison: CohortComparisonResponse | null = dashboardData.analytics?.cohort_comparison ?? null;
      setComparison(nextComparison);
      saveCachedDashboard(CACHE_KEY, { dashboardData, subjectData, atRiskData, comparison: nextComparison });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trainer dashboard.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const cached = loadCachedDashboard<{
      dashboardData: TrainerDashboardResponse;
      subjectData: TrainerSubject[];
      atRiskData: AtRiskStudent[];
      comparison: CohortComparisonResponse | null;
    }>(CACHE_KEY);
    if (cached) {
      setDashboard(cached.dashboardData);
      setSubjects(cached.subjectData);
      setAtRiskStudents(cached.atRiskData);
      setComparison(cached.comparison);
      setIsLoading(false);
    }
    loadDashboard();
  }, [refreshToken, selectedSubjectId]);

  const scopedSubjects = useMemo(
    () => selectedSubjectId ? subjects.filter((subject) => subject.id === selectedSubjectId) : subjects,
    [selectedSubjectId, subjects],
  );
  const strongestSubject = [...scopedSubjects].sort((a, b) => b.average_score - a.average_score)[0] ?? null;
  const weakestSubject = [...scopedSubjects].sort((a, b) => a.average_score - b.average_score)[0] ?? null;
  const recentScoreCount = dashboard?.recent_scores.length ?? 0;
  const passRate = dashboard?.pass_rate ?? 0;
  const attendanceRate = dashboard?.summary_panel?.attendance_rate ?? 0;
  const masteryRate = dashboard?.summary_panel?.mastery_rate ?? 0;
  // Mastery is defined against competencies, but falls back to marks where a
  // scope has no competency evidence. Saying which keeps the tile honest
  // instead of implying evidence that was never captured.
  const masteryBasis = dashboard?.summary_panel?.mastery_basis ?? 'competency';
  const masteryHelper =
    masteryBasis === 'competency' ? 'High-mastery competency share'
    : masteryBasis === 'score' ? 'Learners averaging 75%+ (no competency data)'
    : 'No competency evidence or marks yet';
  const portfolioRate = dashboard?.summary_panel?.portfolio_completion_rate ?? 0;
  // No competency means nothing was ever required, which is not the same as
  // evidence being outstanding — saying "0% portfolio completion" there reads
  // as a cohort failing to submit.
  const portfolioPhrase = dashboard?.summary_panel?.portfolio_basis === 'none'
    ? 'no portfolio requirement defined'
    : `${fmtPct(portfolioRate)} portfolio completion`;

  const pulseItems = [
    `${fmtPct(dashboard?.average_score)} class average across ${dashboard?.total_students ?? 0} students gives the current academic baseline for your teaching scope.`,
    `${fmtPct(passRate)} pass rate and ${atRiskStudents.length} at-risk students show whether underperformance is isolated or starting to spread through the cohort.`,
    `${fmtPct(attendanceRate)} attendance and ${portfolioPhrase} help explain whether the issue is knowledge, participation, or missing evidence.`,
  ];

  const actionItems = [
    weakestSubject
      ? `${weakestSubject.name} is the weakest subject at ${fmtPct(weakestSubject.average_score)}. Start your next intervention cycle there.`
      : 'No subject benchmark is available yet.',
    atRiskStudents.length > 0
      ? `${atRiskStudents.length} learners need immediate attention. Use the watchlist and feedback tools before adding more scores.`
      : 'No at-risk learners are currently flagged.',
    recentScoreCount > 0
      ? `${recentScoreCount} recent scores were captured. The dashboard signals are based on fresh data.`
      : 'No recent score entries yet. Capture new scores to improve dashboard confidence.',
  ];

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AnalyticsHero
        eyebrow="Trainer Dashboard"
        title="Teaching Performance Hub"
        description="Track learner outcomes, identify where performance is slipping, and move directly from signal to intervention without leaving the dashboard."
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

      <label className="block rounded-3xl border border-cyan-400/20 bg-slate-900/80 p-5">
        <span className="block text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Assigned subject scope</span>
        <select
          value={selectedSubjectId}
          onChange={(event) => setSelectedSubjectId(event.target.value)}
          className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 md:max-w-xl"
        >
          <option value="">All assigned subjects</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>{subject.name}</option>
          ))}
        </select>
        <span className="mt-2 block text-xs text-slate-400">All metrics and charts below update to this subject.</span>
      </label>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AnalyticsMetricTile
          label="Assigned Subjects"
          value={dashboard?.subjects_assigned ?? 0}
          helper="Teaching subjects currently in scope"
          icon={BookOpen}
          accent="emerald"
        />
        <AnalyticsMetricTile
          label="Total Students"
          value={dashboard?.total_students ?? 0}
          helper="Distinct learners attached to your subjects"
          icon={Users}
          accent="cyan"
        />
        <AnalyticsMetricTile
          label="Class Average"
          value={fmtPct(dashboard?.average_score)}
          helper={`${dashboard?.recent_scores.length ?? 0} recent scored records`}
          icon={ClipboardList}
          accent="amber"
        />
        <AnalyticsMetricTile
          label="Mastery Rate"
          // Nothing measured is not a rate of zero, so it does not print as one.
          value={masteryBasis === 'none' ? '—' : fmtPct(masteryRate)}
          helper={masteryHelper}
          icon={ShieldAlert}
          accent="violet"
        />
        <AnalyticsMetricTile
          label="Attendance Signal"
          value={fmtPct(attendanceRate)}
          helper="Attendance pattern for this teaching scope"
          icon={Activity}
          accent="slate"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <AnalyticsNarrative title="Teaching Pulse" items={pulseItems} tone="neutral" />
        <AnalyticsNarrative title="Priority Actions" items={actionItems} tone={atRiskStudents.length > 0 ? 'warn' : 'good'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ScoreForm
          subjects={subjects}
          onCreated={async () => {
            setRefreshToken((value) => value + 1);
          }}
        />

        <AnalyticsSection
          title="At-Risk Students"
          description="Learners below the pass threshold or trending weak across subjects."
          action={<WidgetHelp title="At-Risk Students" description="Shows learners whose performance and attendance signals suggest they may need early intervention, remediation, or closer follow-up." />}
        >
          {atRiskStudents.length === 0 ? (
            <p className="text-sm text-slate-500">No at-risk students detected for your current subject set.</p>
          ) : (
            <div className="space-y-3">
              {atRiskStudents.slice(0, 6).map((student) => (
                <div key={student.student_id} className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-100">{student.student_name}</p>
                      <p className="text-xs text-slate-400">{student.student_email}</p>
                    </div>
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-rose-200">
                      {fmtPct(student.average_score)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-300">
                    Weak subjects: {student.weak_subjects.length > 0 ? student.weak_subjects.join(', ') : 'None listed'}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(`/trainer/feedback?student_id=${encodeURIComponent(student.student_id)}${selectedSubjectId ? `&subject_id=${encodeURIComponent(selectedSubjectId)}` : ''}`)}
                    className="mt-3 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
                  >
                    Send targeted feedback
                  </button>
                </div>
              ))}
            </div>
          )}
        </AnalyticsSection>
      </div>

      <ScoresTable subjects={subjects} refreshToken={refreshToken} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <AnalyticsSection
          title="Competency Heatmap"
          description="Student by competency mastery at a glance."
          action={<WidgetHelp title="Competency Heatmap" description="Maps students against competencies with color-coded mastery levels. It helps you quickly identify learning gaps by competency and by learner." />}
        >
          <CompetencyHeatmap items={dashboard?.analytics?.heatmap?.items || []} />
        </AnalyticsSection>

        <AnalyticsSection
          title="Instructional Recommendations"
          description="Rule-based actions generated from performance, attendance, and competency signals."
          action={<WidgetHelp title="Instructional Recommendations" description="Shows suggested teaching actions based on low competency scores, at-risk patterns, and wider cohort learning signals." />}
        >
          <InsightsPanel items={dashboard?.analytics?.recommendations?.items || []} />
        </AnalyticsSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <AnalyticsSection
          title="Attendance vs Performance"
          description={`Correlation ${dashboard?.analytics?.attendance_correlation?.correlation?.value ?? 0}`}
          action={<WidgetHelp title="Attendance vs Performance" description="Plots attendance rates against average scores so you can see whether attendance is strongly linked to learning outcomes in your cohort." />}
        >
          <AttendanceCorrelationChart items={dashboard?.analytics?.attendance_correlation?.items || []} />
        </AnalyticsSection>

        <AnalyticsSection
          title="Portfolio Completion"
          description="Submitted evidence versus expected portfolio items."
          action={<WidgetHelp title="Portfolio Completion" description="Shows submitted evidence versus expected portfolio items, helping you monitor missing learner submissions." />}
        >
          <PortfolioStatusPanel portfolio={dashboard?.analytics?.portfolio || { items: [], last_updated: '' }} />
        </AnalyticsSection>
      </div>

      <AnalyticsSection
        title="Cohort Comparison"
        description="Compare the first two assigned subjects by average score to understand whether a weak outcome is subject-specific or cohort-wide."
        action={<WidgetHelp title="Cohort Comparison" description="Compares two cohorts or subjects side by side using average score so you can spot relative strengths and weaker groups." />}
      >
        <CohortComparisonChart items={(comparison?.cohorts || []).map((cohort) => ({ subject_name: cohort.subject_name, average_score: cohort.average_score }))} />
      </AnalyticsSection>

      <AnalyticsSection
        title="Assigned Subjects"
        description="A quick performance inventory across your teaching load."
        action={<WidgetHelp title="Assigned Subjects" description="Lists your teaching subjects together with their student counts and current average performance." />}
      >
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Strongest Subject</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">{strongestSubject?.name ?? 'No data yet'}</p>
            <p className="mt-1 text-sm text-slate-300">{strongestSubject ? `${fmtPct(strongestSubject.average_score)} average` : 'Waiting for score data.'}</p>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Needs Focus</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">{weakestSubject?.name ?? 'No data yet'}</p>
            <p className="mt-1 text-sm text-slate-300">{weakestSubject ? `${fmtPct(weakestSubject.average_score)} average` : 'Waiting for score data.'}</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subjects.length === 0 ? (
            <p className="text-sm text-slate-500">No subjects assigned to this trainer.</p>
          ) : (
            scopedSubjects.map((subject) => (
              <div key={subject.id} className="rounded-2xl border border-slate-700 bg-slate-800/80 p-5">
                <p className="text-lg font-semibold text-slate-100">{subject.name}</p>
                <p className="mt-1 text-sm text-slate-400">{subject.course_name ?? 'Unmapped course'}</p>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
                  <span>{subject.students_count} students</span>
                  <span>{fmtPct(subject.average_score)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </AnalyticsSection>
    </div>
  );
};

export default TrainerDashboard;
