import { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Download,
  Filter,
  Gauge,
  Layers3,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { adminAnalyticsAPI, type DashboardScopeFilters } from '../api/admin';
import { apiRequest } from '../api/client';
import { AnalyticsHero, AnalyticsMetricTile, AnalyticsNarrative, AnalyticsSection } from '../components/analytics/AnalyticsSurface';
import { ReportActionButton, ReportNotice } from '../components/reports/PremiumReportLayout';
import { useTableControls } from '../hooks/useTableControls';
import { TableFooter, SortableTh } from '../components/ui/TableControls';

interface DashboardStats {
  system_overview: {
    total_students: number;
    total_trainers: number;
    total_institutions: number;
    total_departments: number;
    total_courses: number;
    active_terms: number;
  };
  academic_metrics: {
    total_assessments: number;
    passed_count: number;
    failed_count: number;
    overall_pass_rate: number;
    overall_avg: number;
  };
  recent_activity: {
    scores_in_last_7_days: number;
    recent_scores?: Array<{
      student_name: string | null;
      subject_name: string | null;
      marks: number | null;
      term: string | null;
      recorded_at: string | null;
    }>;
  };
  at_risk_students?: Array<{
    student_id: string;
    name: string;
    avg_score: number;
  }>;
  term_trend?: Array<{
    term: string;
    avg_score: number;
    pass_rate: number;
    scores_count: number;
  }>;
  summary_panel?: {
    mastery_rate: number;
    at_risk_students: number;
    attendance_rate: number;
    portfolio_completion_rate: number;
    alerts: number;
  };
  timestamp?: string;
}

interface CourseAnalytics {
  course_id: string;
  name: string;
  department_id: string;
  enrolled_count: number;
  scores_count: number;
  pass_rate: number;
  avg_score: number;
}

interface DepartmentAnalytics {
  department_id: string;
  name: string;
  students_count: number;
  courses_count: number;
  pass_rate: number;
  avg_score: number;
}

interface ComparisonPayload {
  top_institutions: Array<{ institution_id: string; name: string; avg_score: number; scores_count: number }>;
  bottom_institutions: Array<{ institution_id: string; name: string; avg_score: number; scores_count: number }>;
  top_departments: Array<{ department_id: string; name: string; avg_score: number; scores_count: number }>;
  bottom_departments: Array<{ department_id: string; name: string; avg_score: number; scores_count: number }>;
}

interface OptionItem {
  id: string;
  name: string;
  course_id?: string | null;
  module_id?: string | null;
}

const filterLabelMap: Record<keyof DashboardScopeFilters, string> = {
  department_id: 'Department',
  course_id: 'Course',
  module_id: 'Module',
  subject_id: 'Subject',
  trainer_id: 'Trainer',
  student_id: 'Student',
};

const scoreBandClass = (value: number) => (
  value >= 75
    ? 'bg-emerald-400/10 text-emerald-200'
    : value >= 60
      ? 'bg-amber-400/10 text-amber-200'
      : 'bg-rose-400/10 text-rose-200'
);

const passBandClass = (value: number) => (
  value >= 80
    ? 'bg-emerald-400/10 text-emerald-200'
    : value >= 70
      ? 'bg-amber-400/10 text-amber-200'
      : 'bg-rose-400/10 text-rose-200'
);

const fmtPct = (value: number | null | undefined) => `${Number(value ?? 0).toFixed(1)}%`;

function exportAnalyticsSnapshot(
  dashboardStats: DashboardStats | null,
  courseAnalytics: CourseAnalytics[],
  deptAnalytics: DepartmentAnalytics[],
  comparisons: ComparisonPayload | null,
  activeScopeLabels: string[],
) {
  const rows: string[][] = [
    ['System Analytics Snapshot'],
    ['Generated', new Date().toLocaleString()],
    ['Scope', activeScopeLabels.length > 0 ? activeScopeLabels.join(' | ') : 'All data'],
    [],
    ['Metric', 'Value'],
    ['System Average', fmtPct(dashboardStats?.academic_metrics.overall_avg)],
    ['Pass Rate', fmtPct(dashboardStats?.academic_metrics.overall_pass_rate)],
    ['Assessments', String(dashboardStats?.academic_metrics.total_assessments ?? 0)],
    ['Students', String(dashboardStats?.system_overview.total_students ?? 0)],
    ['Trainers', String(dashboardStats?.system_overview.total_trainers ?? 0)],
    ['Recent Scores (7 days)', String(dashboardStats?.recent_activity.scores_in_last_7_days ?? 0)],
    [],
    ['Top Courses'],
    ['Course', 'Average', 'Pass Rate', 'Enrolled', 'Scores'],
    ...courseAnalytics.slice(0, 10).map((item) => [
      item.name,
      fmtPct(item.avg_score),
      fmtPct(item.pass_rate),
      String(item.enrolled_count),
      String(item.scores_count),
    ]),
    [],
    ['Departments'],
    ['Department', 'Average', 'Pass Rate', 'Students', 'Courses'],
    ...deptAnalytics.slice(0, 10).map((item) => [
      item.name,
      fmtPct(item.avg_score),
      fmtPct(item.pass_rate),
      String(item.students_count),
      String(item.courses_count),
    ]),
  ];

  if (comparisons) {
    rows.push([]);
    rows.push(['Top Institutions']);
    rows.push(['Institution', 'Average', 'Scores']);
    comparisons.top_institutions.forEach((item) => {
      rows.push([item.name, fmtPct(item.avg_score), String(item.scores_count)]);
    });
  }

  const csv = rows
    .map((row) => row.map((cell) => JSON.stringify(cell)).join(','))
    .join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'system-analytics-snapshot.csv';
  link.click();
}

export default function AdminSystemAnalyticsPage() {
  const [scope, setScope] = useState<DashboardScopeFilters>({});
  const [courseOptions, setCourseOptions] = useState<OptionItem[]>([]);
  const [moduleOptions, setModuleOptions] = useState<OptionItem[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<OptionItem[]>([]);
  const [trainerOptions, setTrainerOptions] = useState<OptionItem[]>([]);
  const [studentOptions, setStudentOptions] = useState<OptionItem[]>([]);
  const [courseAnalytics, setCourseAnalytics] = useState<CourseAnalytics[]>([]);
  const [deptAnalytics, setDeptAnalytics] = useState<DepartmentAnalytics[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [comparisons, setComparisons] = useState<ComparisonPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [courses, modules, subjects, trainers, students] = await Promise.all([
          apiRequest<any[]>('/courses'),
          apiRequest<any[]>('/modules'),
          apiRequest<any[]>('/subjects'),
          apiRequest<any[]>('/trainers'),
          apiRequest<any[]>('/students'),
        ]);

        setCourseOptions((Array.isArray(courses) ? courses : []).map((item) => ({ id: String(item.id), name: item.name ?? 'Unnamed course' })));
        setModuleOptions((Array.isArray(modules) ? modules : []).map((item) => ({ id: String(item.id), name: item.name ?? 'Unnamed module', course_id: item.course_id ?? null })));
        setSubjectOptions((Array.isArray(subjects) ? subjects : []).map((item) => ({ id: String(item.id), name: item.name ?? 'Unnamed subject', course_id: item.course_id ?? null, module_id: item.module_id ?? null })));
        setTrainerOptions((Array.isArray(trainers) ? trainers : []).map((item) => ({ id: String(item.id), name: item.user?.name ?? item.name ?? 'Unnamed trainer' })));
        setStudentOptions((Array.isArray(students) ? students : []).map((item) => ({ id: String(item.id), name: item.user?.name ?? item.name ?? 'Unnamed student' })));
      } catch {
        setCourseOptions([]);
        setModuleOptions([]);
        setSubjectOptions([]);
        setTrainerOptions([]);
        setStudentOptions([]);
      }
    };

    loadOptions();
  }, []);

  const filteredModules = scope.course_id
    ? moduleOptions.filter((module) => module.course_id === scope.course_id)
    : moduleOptions;

  const filteredSubjects = scope.module_id
    ? subjectOptions.filter((subject) => subject.module_id === scope.module_id)
    : scope.course_id
      ? subjectOptions.filter((subject) => subject.course_id === scope.course_id)
      : subjectOptions;

  const updateScope = (patch: Partial<DashboardScopeFilters>, reset: Array<keyof DashboardScopeFilters> = []) => {
    setScope((current) => {
      const next = { ...current, ...patch };
      reset.forEach((key) => {
        delete next[key];
      });
      return next;
    });
  };

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);
        const [courses, depts, dashboard, benchmarkData] = await Promise.all([
          adminAnalyticsAPI.getCoursesAnalytics(scope) as Promise<CourseAnalytics[]>,
          adminAnalyticsAPI.getDepartmentsAnalytics(scope) as Promise<DepartmentAnalytics[]>,
          adminAnalyticsAPI.getDashboard(scope) as Promise<DashboardStats>,
          adminAnalyticsAPI.getComparisons(scope) as Promise<ComparisonPayload>,
        ]);
        setCourseAnalytics(Array.isArray(courses) ? courses : []);
        setDeptAnalytics(Array.isArray(depts) ? depts : []);
        setDashboardStats(dashboard);
        setComparisons(benchmarkData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    loadAnalytics();
  }, [scope]);

  const courseTc = useTableControls(courseAnalytics);
  const deptTc = useTableControls(deptAnalytics);

  const scopeOptionMap: Record<keyof DashboardScopeFilters, OptionItem[]> = {
    department_id: deptAnalytics.map((item) => ({ id: item.department_id, name: item.name })),
    course_id: courseOptions,
    module_id: moduleOptions,
    subject_id: subjectOptions,
    trainer_id: trainerOptions,
    student_id: studentOptions,
  };

  const activeScopeLabels = (Object.entries(scope) as Array<[keyof DashboardScopeFilters, string | undefined]>)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => {
      const match = scopeOptionMap[key].find((item) => item.id === value);
      return `${filterLabelMap[key]}: ${match?.name ?? value}`;
    });

  const topCourse = [...courseAnalytics].sort((a, b) => b.avg_score - a.avg_score)[0] ?? null;
  const weakestCourse = [...courseAnalytics].sort((a, b) => a.pass_rate - b.pass_rate)[0] ?? null;
  const strongestDept = [...deptAnalytics].sort((a, b) => b.pass_rate - a.pass_rate)[0] ?? null;
  const weakestDept = [...deptAnalytics].sort((a, b) => a.avg_score - b.avg_score)[0] ?? null;
  const learnerTrainerRatio = dashboardStats?.system_overview.total_trainers
    ? dashboardStats.system_overview.total_students / dashboardStats.system_overview.total_trainers
    : 0;
  const assessmentDensity = dashboardStats?.system_overview.total_students
    ? (dashboardStats.academic_metrics.total_assessments / dashboardStats.system_overview.total_students)
    : 0;
  const recentVelocity = dashboardStats?.academic_metrics.total_assessments
    ? ((dashboardStats.recent_activity.scores_in_last_7_days / dashboardStats.academic_metrics.total_assessments) * 100)
    : 0;
  const benchmarkSpread = comparisons && comparisons.top_departments.length > 0 && comparisons.bottom_departments.length > 0
    ? comparisons.top_departments[0].avg_score - comparisons.bottom_departments[0].avg_score
    : 0;

  const watchItems = [
    weakestCourse
      ? `${weakestCourse.name} has the weakest pass-rate signal at ${fmtPct(weakestCourse.pass_rate)}. It is the first course to review for intervention planning.`
      : 'No course benchmark is available yet for pass-rate comparison.',
    weakestDept
      ? `${weakestDept.name} is the lowest-scoring department at ${fmtPct(weakestDept.avg_score)} average. Consider staffing, assessment quality, and attendance patterns there first.`
      : 'No department benchmark is available yet.',
    (dashboardStats?.at_risk_students?.length ?? 0) > 0
      ? `${dashboardStats?.at_risk_students?.length ?? 0} at-risk learners appear in the current scope. Prioritize them before broad performance campaigns.`
      : 'No at-risk learners are flagged in the current scope.',
  ];

  const understandingItems = [
    `${fmtPct(dashboardStats?.academic_metrics.overall_avg)} system average across ${dashboardStats?.academic_metrics.total_assessments ?? 0} recorded assessments gives you the baseline performance level in this scope.`,
    `${fmtPct(dashboardStats?.academic_metrics.overall_pass_rate)} pass rate with ${fmtPct(benchmarkSpread)} benchmark spread shows whether variance is systemic or concentrated in weaker departments.`,
    `${assessmentDensity.toFixed(1)} assessments per learner and ${fmtPct(recentVelocity)} recent score velocity show how fresh and statistically dense the current reporting picture is.`,
  ];

  const termTrend = dashboardStats?.term_trend ?? [];
  const recentScores = dashboardStats?.recent_activity.recent_scores ?? [];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <AnalyticsHero
          eyebrow="Admin Analytics"
          title="System Analytics & Reporting"
          description="A clearer institutional performance view across learners, delivery teams, departments, and courses. Use the scoped filters to isolate where performance moves, stalls, or breaks down."
        >
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] px-6 py-4 backdrop-blur">
            <p className="text-sm text-slate-300">Snapshot updated</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {dashboardStats?.timestamp ? new Date(dashboardStats.timestamp).toLocaleString() : 'Live'}
            </p>
          </div>
        </AnalyticsHero>

        {error ? <ReportNotice icon={AlertCircle} tone="error">{error}</ReportNotice> : null}

        <AnalyticsSection
          title="Scope Filters"
          description="Filter by course, module, subject, trainer, or student to reduce noise and understand where a signal starts."
          action={(
            <button
              type="button"
              onClick={() => setScope({})}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              Clear Scope
            </button>
          )}
        >
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
            <Filter size={18} className="text-cyan-300" />
            <span>{activeScopeLabels.length > 0 ? 'Active scope applied below' : 'No scope filter applied. Showing system-wide data.'}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-2 text-sm text-slate-400">
              <span>Course</span>
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" value={scope.course_id ?? ''} onChange={(event) => updateScope({ course_id: event.target.value || undefined }, ['module_id', 'subject_id'])}>
                <option value="">All courses</option>
                {courseOptions.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-400">
              <span>Module</span>
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" value={scope.module_id ?? ''} onChange={(event) => updateScope({ module_id: event.target.value || undefined }, ['subject_id'])}>
                <option value="">All modules</option>
                {filteredModules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-400">
              <span>Subject</span>
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" value={scope.subject_id ?? ''} onChange={(event) => updateScope({ subject_id: event.target.value || undefined })}>
                <option value="">All subjects</option>
                {filteredSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-400">
              <span>Trainer</span>
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" value={scope.trainer_id ?? ''} onChange={(event) => updateScope({ trainer_id: event.target.value || undefined })}>
                <option value="">All trainers</option>
                {trainerOptions.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-400">
              <span>Student</span>
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" value={scope.student_id ?? ''} onChange={(event) => updateScope({ student_id: event.target.value || undefined })}>
                <option value="">All students</option>
                {studentOptions.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
              </select>
            </label>
          </div>
          {activeScopeLabels.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {activeScopeLabels.map((item) => (
                <span key={item} className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </AnalyticsSection>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <AnalyticsMetricTile
            label="System Average"
            value={fmtPct(dashboardStats?.academic_metrics.overall_avg)}
            helper={`${dashboardStats?.academic_metrics.total_assessments ?? 0} assessments in scope`}
            icon={Gauge}
            accent="cyan"
          />
          <AnalyticsMetricTile
            label="Pass Rate"
            value={fmtPct(dashboardStats?.academic_metrics.overall_pass_rate)}
            helper={`${dashboardStats?.academic_metrics.passed_count ?? 0} passed / ${dashboardStats?.academic_metrics.failed_count ?? 0} failed`}
            icon={ArrowUpRight}
            accent="emerald"
          />
          <AnalyticsMetricTile
            label="Learner / Trainer"
            value={learnerTrainerRatio > 0 ? learnerTrainerRatio.toFixed(1) : '0.0'}
            helper={`${dashboardStats?.system_overview.total_students ?? 0} students across ${dashboardStats?.system_overview.total_trainers ?? 0} trainers`}
            icon={Users}
            accent="violet"
          />
          <AnalyticsMetricTile
            label="Assessment Density"
            value={assessmentDensity.toFixed(1)}
            helper="Average recorded assessments per learner"
            icon={Layers3}
            accent="amber"
          />
          <AnalyticsMetricTile
            label="Recent Activity"
            value={dashboardStats?.recent_activity.scores_in_last_7_days ?? 0}
            helper={`${fmtPct(recentVelocity)} of all scores were recorded in the last 7 days`}
            icon={Activity}
            accent="slate"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <AnalyticsNarrative title="What This Snapshot Means" items={understandingItems} tone="neutral" />
          <AnalyticsNarrative
            title="Watchpoints"
            items={watchItems}
            tone={(dashboardStats?.at_risk_students?.length ?? 0) > 0 ? 'warn' : 'good'}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <AnalyticsSection title="Term Momentum" description="Average score and pass-rate movement by recorded term. This helps separate a one-off weak cohort from a persistent decline.">
            {termTrend.length === 0 ? (
              <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-slate-700 text-slate-500">
                No term trend data available in the current scope.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={termTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="term" tick={{ fill: '#94a3b8', fontSize: 12 }}>
                    <Label value="Term" position="insideBottom" offset={-5} fill="#64748b" />
                  </XAxis>
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }}>
                    <Label value="Percentage (%)" angle={-90} position="insideLeft" fill="#64748b" />
                  </YAxis>
                  <Tooltip formatter={(value) => fmtPct(Number(value))} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                  <Legend />
                  <Line type="monotone" dataKey="avg_score" stroke="#22d3ee" strokeWidth={3} name="Average Score" dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="pass_rate" stroke="#34d399" strokeWidth={3} name="Pass Rate" dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </AnalyticsSection>

          <AnalyticsSection
            title="Benchmark Leaders"
            description="Best visible performers in the current scope."
            action={(
              <ReportActionButton
                icon={Download}
                variant="secondary"
                onClick={() => exportAnalyticsSnapshot(dashboardStats, courseAnalytics, deptAnalytics, comparisons, activeScopeLabels)}
              >
                Export Snapshot
              </ReportActionButton>
            )}
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Strongest Course</p>
                <p className="mt-2 text-lg font-semibold text-slate-100">{topCourse?.name ?? 'No data yet'}</p>
                <p className="mt-1 text-sm text-slate-300">
                  {topCourse ? `${fmtPct(topCourse.avg_score)} average · ${fmtPct(topCourse.pass_rate)} pass rate` : 'No scores recorded in scope.'}
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Strongest Department</p>
                <p className="mt-2 text-lg font-semibold text-slate-100">{strongestDept?.name ?? 'No data yet'}</p>
                <p className="mt-1 text-sm text-slate-300">
                  {strongestDept ? `${fmtPct(strongestDept.avg_score)} average · ${fmtPct(strongestDept.pass_rate)} pass rate` : 'No department analytics available.'}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Top Institutions</p>
                <div className="mt-3 space-y-2">
                  {(comparisons?.top_institutions ?? []).slice(0, 3).map((item) => (
                    <div key={item.institution_id} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-sm">
                      <span className="text-slate-200">{item.name}</span>
                      <span className="text-cyan-200">{fmtPct(item.avg_score)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </AnalyticsSection>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <AnalyticsSection title="Course Performance Map" description="Compare average score and pass rate side by side to see whether poor outcomes are caused by low means, low completion, or both.">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={courseAnalytics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" angle={-30} textAnchor="end" height={72} tick={{ fill: '#94a3b8', fontSize: 11 }}>
                  <Label value="Course" position="insideBottom" offset={-5} fill="#64748b" />
                </XAxis>
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }}>
                  <Label value="Percentage (%)" angle={-90} position="insideLeft" fill="#64748b" />
                </YAxis>
                <Tooltip formatter={(value) => fmtPct(Number(value))} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                <Legend />
                <Bar dataKey="avg_score" fill="#38bdf8" name="Average Score" radius={[6, 6, 0, 0]} />
                <Bar dataKey="pass_rate" fill="#34d399" name="Pass Rate" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </AnalyticsSection>

          <AnalyticsSection title="Department Performance Map" description="See where learner volume and delivery quality diverge across departments.">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={deptAnalytics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" angle={-30} textAnchor="end" height={72} tick={{ fill: '#94a3b8', fontSize: 11 }}>
                  <Label value="Department" position="insideBottom" offset={-5} fill="#64748b" />
                </XAxis>
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }}>
                  <Label value="Percentage (%)" angle={-90} position="insideLeft" fill="#64748b" />
                </YAxis>
                <Tooltip formatter={(value) => fmtPct(Number(value))} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                <Legend />
                <Bar dataKey="avg_score" fill="#8b5cf6" name="Average Score" radius={[6, 6, 0, 0]} />
                <Bar dataKey="pass_rate" fill="#f59e0b" name="Pass Rate" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </AnalyticsSection>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <AnalyticsSection title="Attention Queue" description="Learners and entities most likely to need immediate review based on current low-score signals.">
            <div className="space-y-3">
              {(dashboardStats?.at_risk_students ?? []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-slate-500">
                  No at-risk learners in the active scope.
                </div>
              ) : (
                (dashboardStats?.at_risk_students ?? []).slice(0, 6).map((student) => (
                  <div key={student.student_id} className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-100">{student.name}</p>
                        <p className="text-xs text-slate-400">Low-performance watchlist</p>
                      </div>
                      <span className={['rounded-full px-3 py-1 text-xs font-semibold', scoreBandClass(student.avg_score)].join(' ')}>
                        {fmtPct(student.avg_score)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </AnalyticsSection>

          <AnalyticsSection title="Recent Score Activity" description="The latest score entries help validate whether a trend is current or stale.">
            <div className="space-y-3">
              {recentScores.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-slate-500">
                  No recent score activity found in the last seven days.
                </div>
              ) : recentScores.map((entry, index) => (
                <div key={`${entry.student_name ?? 'unknown'}-${entry.recorded_at ?? index}`} className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-100">{entry.student_name ?? 'Unknown student'}</p>
                    <p className="text-sm text-slate-400">{entry.subject_name ?? 'Unknown subject'}{entry.term ? ` · ${entry.term}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className={['rounded-full px-3 py-1 text-xs font-semibold', scoreBandClass(Number(entry.marks ?? 0))].join(' ')}>
                      {fmtPct(Number(entry.marks ?? 0))}
                    </span>
                    <span className="text-slate-500">
                      {entry.recorded_at ? new Date(entry.recorded_at).toLocaleString() : 'Just now'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </AnalyticsSection>
        </div>

        <AnalyticsSection title="Detailed Course Analytics" description="Sort and scan the raw course numbers when you need to move from broad signals into operational decisions.">
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <SortableTh label="Course" sortKey="name" sort={courseTc.sort} onSort={courseTc.setSort} />
                  <SortableTh label="Enrolled" sortKey="enrolled_count" sort={courseTc.sort} onSort={courseTc.setSort} />
                  <SortableTh label="Scores" sortKey="scores_count" sort={courseTc.sort} onSort={courseTc.setSort} />
                  <SortableTh label="Avg Score" sortKey="avg_score" sort={courseTc.sort} onSort={courseTc.setSort} />
                  <SortableTh label="Pass Rate" sortKey="pass_rate" sort={courseTc.sort} onSort={courseTc.setSort} />
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-300">Interpretation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {courseTc.paged.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-4 text-center text-slate-500">No course data available</td></tr>
                ) : courseTc.paged.map((item) => (
                  <tr key={item.course_id} className="hover:bg-slate-800/60">
                    <td className="px-6 py-4 font-medium text-slate-100">{item.name}</td>
                    <td className="px-6 py-4 text-slate-400">{item.enrolled_count}</td>
                    <td className="px-6 py-4 text-slate-400">{item.scores_count}</td>
                    <td className="px-6 py-4">
                      <span className={['rounded-full px-3 py-1 text-sm font-semibold', scoreBandClass(item.avg_score)].join(' ')}>
                        {fmtPct(item.avg_score)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={['rounded-full px-3 py-1 text-sm font-semibold', passBandClass(item.pass_rate)].join(' ')}>
                        {fmtPct(item.pass_rate)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {item.pass_rate >= 80
                        ? 'Healthy outcome profile'
                        : item.pass_rate >= 70
                          ? 'Stable but watch variance'
                          : 'Needs intervention'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TableFooter page={courseTc.page} totalPages={courseTc.totalPages} total={courseTc.total} pageSize={courseTc.pageSize} onPage={courseTc.setPage} />
        </AnalyticsSection>

        <AnalyticsSection title="Detailed Department Analytics" description="Department-level operating view for management reviews, resource allocation, and escalation.">
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <SortableTh label="Department" sortKey="name" sort={deptTc.sort} onSort={deptTc.setSort} />
                  <SortableTh label="Students" sortKey="students_count" sort={deptTc.sort} onSort={deptTc.setSort} />
                  <SortableTh label="Courses" sortKey="courses_count" sort={deptTc.sort} onSort={deptTc.setSort} />
                  <SortableTh label="Avg Score" sortKey="avg_score" sort={deptTc.sort} onSort={deptTc.setSort} />
                  <SortableTh label="Pass Rate" sortKey="pass_rate" sort={deptTc.sort} onSort={deptTc.setSort} />
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-300">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {deptTc.paged.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-4 text-center text-slate-500">No department data available</td></tr>
                ) : deptTc.paged.map((dept) => (
                  <tr key={dept.department_id} className="hover:bg-slate-800/60">
                    <td className="px-6 py-4 font-medium text-slate-100">{dept.name}</td>
                    <td className="px-6 py-4 text-slate-400">{dept.students_count}</td>
                    <td className="px-6 py-4 text-slate-400">{dept.courses_count}</td>
                    <td className="px-6 py-4">
                      <span className={['rounded-full px-3 py-1 text-sm font-semibold', scoreBandClass(dept.avg_score)].join(' ')}>
                        {fmtPct(dept.avg_score)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={['rounded-full px-3 py-1 text-sm font-semibold', passBandClass(dept.pass_rate)].join(' ')}>
                        {fmtPct(dept.pass_rate)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {dept.avg_score < 60 || dept.pass_rate < 70 ? (
                        <span className="inline-flex items-center gap-2 text-rose-300"><ShieldAlert size={14} />High review priority</span>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-emerald-300"><Sparkles size={14} />Within expected range</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TableFooter page={deptTc.page} totalPages={deptTc.totalPages} total={deptTc.total} pageSize={deptTc.pageSize} onPage={deptTc.setPage} />
        </AnalyticsSection>
      </div>
    </div>
  );
}
