import { useState, useEffect, useMemo } from 'react';
import { Users, BookOpen, TrendingUp, AlertCircle, BarChart3, PieChart, LineChart as LineChartIcon, Filter } from 'lucide-react';
import { LineChart, Line, PieChart as PieChartComponent, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Label } from 'recharts';
import { adminDashboardAPI, adminAnalyticsAPI, type DashboardScopeFilters } from '../api/admin';
import { apiRequest } from '../api/client';
import { useNavigate } from 'react-router-dom';
import CompetencyHeatmap from '../components/charts/CompetencyHeatmap';
import AttendanceCorrelationChart from '../components/charts/AttendanceCorrelationChart';
import CohortComparisonChart from '../components/charts/CohortComparisonChart';
import InsightsPanel from '../components/ui/InsightsPanel';
import PortfolioStatusPanel from '../components/ui/PortfolioStatusPanel';
import WidgetHelp from '../components/ui/WidgetHelp';
import type { AdvancedDashboardResponse, CohortComparisonResponse } from '../services/analyticsApi';
import { loadCachedDashboard, saveCachedDashboard } from '../utils/dashboardCache';

interface DashboardMetric {
  label: string;
  value: number | string;
  icon: any;
  color: string;
  bgColor: string;
}

interface DepartmentPerformance {
  department_id: string;
  name: string;
  avg_score: number;
  students_count: number;
  pass_rate: number;
}

interface TermTrend {
  term: string;
  avg_score: number;
  pass_rate: number;
}

interface AtRiskStudent {
  student_id: string;
  name: string;
  avg_score: number;
}

interface OptionItem {
  id: string;
  name: string;
  department_id?: string | null;
  course_id?: string | null;
  module_id?: string | null;
  subject_ids?: string[];
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#f87171'];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<DashboardScopeFilters>({});
  const [departmentOptions, setDepartmentOptions] = useState<OptionItem[]>([]);
  const [courseOptions, setCourseOptions] = useState<OptionItem[]>([]);
  const [moduleOptions, setModuleOptions] = useState<OptionItem[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<OptionItem[]>([]);
  const [trainerOptions, setTrainerOptions] = useState<OptionItem[]>([]);
  const [studentOptions, setStudentOptions] = useState<OptionItem[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [departments, setDepartments] = useState<DepartmentPerformance[]>([]);
  const [departmentChartData, setDepartmentChartData] = useState<any[]>([]);
  const [termTrend, setTermTrend] = useState<TermTrend[]>([]);
  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([]);
  const [advanced, setAdvanced] = useState<AdvancedDashboardResponse | null>(null);
  const [comparison, setComparison] = useState<CohortComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [departmentSort, setDepartmentSort] = useState<'highest' | 'lowest' | 'students'>('highest');
  const [progressSort, setProgressSort] = useState<'lowest' | 'highest' | 'student' | 'period'>('lowest');
  const [progressStatus, setProgressStatus] = useState<'all' | 'passed' | 'failed'>('all');

  useEffect(() => {
    const loadOptions = async () => {
      try {
        // One lean request instead of six full list endpoints. Those returned
        // every student and trainer row in the institution — each lazy-loading
        // its user record server-side — when all the dropdowns keep is an id,
        // a name, and a parent id.
        const options = await apiRequest<{
          departments: { id: string; name: string }[];
          courses: { id: string; name: string; department_id: string | null }[];
          modules: { id: string; name: string; course_id: string | null }[];
          subjects: { id: string; name: string; module_id: string | null; course_id: string | null }[];
          trainers: { id: string; name: string; department_id: string | null; subject_ids: string[] }[];
          students: { id: string; name: string; course_id: string | null; subject_ids: string[] }[];
        }>('/admin/dashboard/filter-options');

        setDepartmentOptions(options.departments ?? []);
        setCourseOptions(options.courses ?? []);
        setModuleOptions(options.modules ?? []);
        setSubjectOptions(options.subjects ?? []);
        setTrainerOptions(options.trainers ?? []);
        setStudentOptions(options.students ?? []);
      } catch (err) {
        setDepartmentOptions([]);
        setCourseOptions([]);
        setModuleOptions([]);
        setSubjectOptions([]);
        setTrainerOptions([]);
        setStudentOptions([]);
      }
    };

    loadOptions();
  }, []);

  useEffect(() => {
    const cacheKey = [
      'lad.admin.dashboard.v3',
      scope.department_id,
      scope.course_id,
      scope.module_id,
      scope.subject_id,
      scope.trainer_id,
      scope.student_id,
    ].filter(Boolean).join(':');

    const cached = loadCachedDashboard<{
      metrics: DashboardMetric[];
      departments: DepartmentPerformance[];
      departmentChartData: any[];
      termTrend: TermTrend[];
      atRisk: AtRiskStudent[];
      advanced: AdvancedDashboardResponse | null;
      comparison: CohortComparisonResponse | null;
    }>(cacheKey);
    if (cached) {
      setMetrics(cached.metrics);
      setDepartments(cached.departments);
      setDepartmentChartData(cached.departmentChartData);
      setTermTrend(cached.termTrend);
      setAtRisk(cached.atRisk);
      setAdvanced(cached.advanced);
      setComparison(cached.comparison);
      setLoading(false);
    }

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError(null);

        const [dashboardDataRaw, departmentsDataRaw] = await Promise.all([
          adminDashboardAPI.getDashboardStats(scope),
          adminAnalyticsAPI.getDepartmentsAnalytics(scope),
        ]);
        const dashboardData = dashboardDataRaw as any;
        const departmentsData = departmentsDataRaw as any[];
        const advancedData = (dashboardDataRaw as any).analytics as AdvancedDashboardResponse;

        const nextMetrics = [
          { label: 'Total Students', value: dashboardData.system_overview?.total_students || 0, icon: Users, color: 'text-blue-600', bgColor: 'bg-blue-100' },
          { label: 'Active Trainers', value: dashboardData.system_overview?.total_trainers || 0, icon: Users, color: 'text-purple-600', bgColor: 'bg-purple-100' },
          { label: 'Total Courses', value: dashboardData.system_overview?.total_courses || 0, icon: BookOpen, color: 'text-amber-600', bgColor: 'bg-amber-100' },
          { label: 'Departments', value: dashboardData.system_overview?.total_departments || 0, icon: BookOpen, color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
          { label: 'Progress Records', value: advancedData?.progress?.items?.length || 0, icon: BarChart3, color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
          { label: 'Overall Pass Rate', value: `${dashboardData.academic_metrics?.overall_pass_rate || 0}%`, icon: TrendingUp, color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
        ];
        setMetrics(nextMetrics);

        // Real term trend from dashboard
        const trend: TermTrend[] = (dashboardData.term_trend || []).map((t: any) => ({
          term: t.term,
          avg_score: t.avg_score,
          pass_rate: t.pass_rate,
        }));
        setTermTrend(trend);

        // At-risk students from dashboard
        setAtRisk(dashboardData.at_risk_students || []);
        setAdvanced(advancedData);

        const formattedDepts = (departmentsData || []).map((dept: any) => ({
          department_id: dept.department_id,
          name: dept.name,
          avg_score: Math.round(dept.avg_score || 0),
          students_count: dept.students_count || 0,
          pass_rate: Math.round(dept.pass_rate || 0),
        }));
        setDepartments(formattedDepts);
        setDepartmentChartData(formattedDepts.map((dept: any, idx: number) => ({
          name: dept.name,
          value: dept.avg_score,
          fill: COLORS[idx % COLORS.length],
        })));

        const nextComparison: CohortComparisonResponse | null = advancedData?.cohort_comparison ?? null;

        saveCachedDashboard(cacheKey, {
          metrics: nextMetrics,
          departments: formattedDepts,
          departmentChartData: formattedDepts.map((dept: any, idx: number) => ({
            name: dept.name,
            value: dept.avg_score,
            fill: COLORS[idx % COLORS.length],
          })),
          termTrend: trend,
          atRisk: dashboardData.at_risk_students || [],
          advanced: advancedData,
          comparison: nextComparison,
        });
        setComparison(nextComparison);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, [scope]);

  const filteredCourses = useMemo(
    () => scope.department_id
      ? courseOptions.filter((course) => course.department_id === scope.department_id)
      : courseOptions,
    [courseOptions, scope.department_id],
  );

  const departmentCourseIds = useMemo(
    () => new Set(filteredCourses.map((course) => course.id)),
    [filteredCourses],
  );

  const filteredModules = useMemo(() => {
    if (scope.course_id) return moduleOptions.filter((module) => module.course_id === scope.course_id);
    if (scope.department_id) return moduleOptions.filter((module) => module.course_id && departmentCourseIds.has(module.course_id));
    return moduleOptions;
  }, [moduleOptions, scope.course_id, scope.department_id, departmentCourseIds]);

  const filteredSubjects = useMemo(() => {
    if (scope.module_id) return subjectOptions.filter((subject) => subject.module_id === scope.module_id);
    if (scope.course_id) return subjectOptions.filter((subject) => subject.course_id === scope.course_id);
    if (scope.department_id) return subjectOptions.filter((subject) => subject.course_id && departmentCourseIds.has(subject.course_id));
    return subjectOptions;
  }, [subjectOptions, scope.module_id, scope.course_id, scope.department_id, departmentCourseIds]);

  const allowedSubjectIds = useMemo(
    () => new Set(filteredSubjects.map((subject) => subject.id)),
    [filteredSubjects],
  );

  const filteredTrainers = useMemo(() => trainerOptions.filter((trainer) => {
    if (
      scope.department_id
      && trainer.department_id !== scope.department_id
      && !trainer.subject_ids?.some((subjectId) => allowedSubjectIds.has(subjectId))
    ) return false;
    if (scope.subject_id) return trainer.subject_ids?.includes(scope.subject_id);
    if (scope.module_id || scope.course_id || scope.department_id) {
      return trainer.subject_ids?.some((subjectId) => allowedSubjectIds.has(subjectId));
    }
    return true;
  }), [trainerOptions, scope.department_id, scope.course_id, scope.module_id, scope.subject_id, allowedSubjectIds]);

  const selectedTrainerSubjectIds = useMemo(
    () => new Set(trainerOptions.find((trainer) => trainer.id === scope.trainer_id)?.subject_ids ?? []),
    [trainerOptions, scope.trainer_id],
  );

  const filteredStudents = useMemo(() => studentOptions.filter((student) => {
    if (scope.course_id && student.course_id !== scope.course_id) return false;
    if (!scope.course_id && scope.department_id && (!student.course_id || !departmentCourseIds.has(student.course_id))) return false;
    if (scope.subject_id && !student.subject_ids?.includes(scope.subject_id)) return false;
    if (!scope.subject_id && scope.module_id && !student.subject_ids?.some((subjectId) => allowedSubjectIds.has(subjectId))) return false;
    if (scope.trainer_id && !student.subject_ids?.some((subjectId) => selectedTrainerSubjectIds.has(subjectId))) return false;
    return true;
  }), [
    studentOptions,
    scope.department_id,
    scope.course_id,
    scope.module_id,
    scope.subject_id,
    scope.trainer_id,
    departmentCourseIds,
    allowedSubjectIds,
    selectedTrainerSubjectIds,
  ]);

  const updateScope = (patch: Partial<DashboardScopeFilters>, reset: Array<keyof DashboardScopeFilters> = []) => {
    setScope((current) => {
      const next = { ...current, ...patch };
      reset.forEach((key) => {
        delete next[key];
      });
      return next;
    });
  };

  const sortedDepartments = useMemo(() => [...departments].sort((a, b) => {
    if (departmentSort === 'lowest') return a.avg_score - b.avg_score;
    if (departmentSort === 'students') return b.students_count - a.students_count;
    return b.avg_score - a.avg_score;
  }), [departments, departmentSort]);

  const sortedProgress = useMemo(() => {
    const items = (advanced?.progress?.items ?? []).filter((item) => {
      if (progressStatus === 'passed') return Number(item.average_score || 0) >= 50;
      if (progressStatus === 'failed') return Number(item.average_score || 0) < 50;
      return true;
    });
    items.sort((a, b) => {
      if (progressSort === 'highest') return Number(b.average_score || 0) - Number(a.average_score || 0);
      if (progressSort === 'student') return String(a.student_name || '').localeCompare(String(b.student_name || ''));
      if (progressSort === 'period') return String(b.date || '').localeCompare(String(a.date || ''));
      return Number(a.average_score || 0) - Number(b.average_score || 0);
    });
    return items;
  }, [advanced?.progress?.items, progressSort, progressStatus]);

  const progressCounts = useMemo(() => {
    const items = advanced?.progress?.items ?? [];
    const passed = items.filter((item) => Number(item.average_score || 0) >= 50).length;
    return { all: items.length, passed, failed: items.length - passed };
  }, [advanced?.progress?.items]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-100">Admin Dashboard</h1>
          <p className="text-slate-400 mt-2">System overview and institutional analytics</p>
        </div>

        {/* Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-emerald-400" />
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Dashboard scope & progress tracking</h2>
                <p className="text-xs text-slate-500">Choose a department first. Every next list only shows matching records.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setScope({})}
              className="self-start rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              Clear filters
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <label className="space-y-2 text-sm text-slate-400">
              <span>Department</span>
              <select
                className="w-full rounded-xl border border-emerald-800 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-500"
                value={scope.department_id ?? ''}
                onChange={(event) => updateScope(
                  { department_id: event.target.value || undefined },
                  ['course_id', 'module_id', 'subject_id', 'trainer_id', 'student_id'],
                )}
              >
                <option value="">Choose department</option>
                {departmentOptions.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-400">
              <span>Course</span>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-500"
                value={scope.course_id ?? ''}
                disabled={!scope.department_id}
                onChange={(event) => updateScope(
                  { course_id: event.target.value || undefined },
                  ['module_id', 'subject_id', 'trainer_id', 'student_id'],
                )}
              >
                <option value="">{scope.department_id ? 'All department courses' : 'Choose department first'}</option>
                {filteredCourses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-400">
              <span>Module</span>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-500"
                value={scope.module_id ?? ''}
                disabled={!scope.course_id}
                onChange={(event) => updateScope(
                  { module_id: event.target.value || undefined },
                  ['subject_id', 'trainer_id', 'student_id'],
                )}
              >
                <option value="">{scope.course_id ? 'All course modules' : 'Choose course first'}</option>
                {filteredModules.map((module) => (
                  <option key={module.id} value={module.id}>{module.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-400">
              <span>Subject</span>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-500"
                value={scope.subject_id ?? ''}
                disabled={!scope.module_id}
                onChange={(event) => updateScope(
                  { subject_id: event.target.value || undefined },
                  ['trainer_id', 'student_id'],
                )}
              >
                <option value="">{scope.module_id ? 'All module subjects' : 'Choose module first'}</option>
                {filteredSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-400">
              <span>Trainer</span>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-500"
                value={scope.trainer_id ?? ''}
                disabled={!scope.subject_id}
                onChange={(event) => updateScope(
                  { trainer_id: event.target.value || undefined },
                  ['student_id'],
                )}
              >
                <option value="">{scope.subject_id ? 'All subject trainers' : 'Choose subject first'}</option>
                {filteredTrainers.map((trainer) => (
                  <option key={trainer.id} value={trainer.id}>{trainer.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-400">
              <span>Student</span>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-500"
                value={scope.student_id ?? ''}
                disabled={!scope.trainer_id}
                onChange={(event) => updateScope({ student_id: event.target.value || undefined })}
              >
                <option value="">{scope.trainer_id ? 'All trainer students' : 'Choose trainer first'}</option>
                {filteredStudents.map((student) => (
                  <option key={student.id} value={student.id}>{student.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          {[
            { ...metrics[0], description: 'Shows the total number of learner records currently active in the institution-level dataset.' },
            { ...metrics[1], description: 'Shows the number of trainers currently active in the system.' },
            { ...metrics[2], description: 'Shows the total number of courses configured across the institution.' },
            { ...metrics[3], description: 'Shows the number of configured academic departments.' },
            { ...metrics[4], description: 'Shows the number of learner progress records available in the current dashboard scope.' },
            { ...metrics[5], description: 'Shows the percentage of recorded scores that meet the pass threshold across the dashboard scope.' },
          ].filter(Boolean).map((metric, idx) => {
            const Icon = metric.icon;
            return (
              <div key={idx} className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6 hover:shadow-lg transition">
                <div className="flex items-center justify-between mb-4">
                  <WidgetHelp title={metric.label} description={(metric as any).description} />
                  <div className={`${metric.bgColor} p-3 rounded-lg`}>
                    <Icon className={`${metric.color}`} size={24} />
                  </div>
                </div>
                <p className="text-slate-400 text-sm">{metric.label}</p>
                <p className="text-3xl font-bold text-slate-100 mt-2">{typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}</p>
              </div>
            );
          })}
        </div>

        <div className="mb-8 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow">
          <div className="flex flex-col gap-3 border-b border-slate-800 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Progress Tracking</h2>
              <p className="mt-1 text-sm text-slate-500">Results follow the department-first scope selected above.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={progressStatus}
                onChange={(event) => setProgressStatus(event.target.value as typeof progressStatus)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
              >
                <option value="all">All statuses ({progressCounts.all})</option>
                <option value="passed">Passed ({progressCounts.passed})</option>
                <option value="failed">Failed ({progressCounts.failed})</option>
              </select>
              <select
                value={progressSort}
                onChange={(event) => setProgressSort(event.target.value as typeof progressSort)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
              >
                <option value="lowest">Needs attention first</option>
                <option value="highest">Highest progress first</option>
                <option value="student">Student name A–Z</option>
                <option value="period">Latest period first</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-700 bg-slate-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-400">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-400">Subject</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-400">Period</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-400">Average progress</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {sortedProgress.length ? sortedProgress.slice(0, 12).map((item, index) => (
                  <tr key={`${item.student_id}-${item.subject_id}-${item.date}-${index}`} className="hover:bg-slate-800/60">
                    <td className="px-6 py-4 font-medium text-slate-200">{item.student_name || 'Unknown student'}</td>
                    <td className="px-6 py-4 text-slate-400">{item.subject_name || 'Unassigned subject'}</td>
                    <td className="px-6 py-4 text-slate-400">{item.date || 'Unassigned'}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-sm font-bold ${
                        Number(item.average_score || 0) >= 75
                          ? 'bg-emerald-100 text-emerald-800'
                          : Number(item.average_score || 0) >= 50
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                      }`}>
                        {Number(item.average_score || 0).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {Number(item.average_score || 0) >= 50 ? (
                        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-300">Passed</span>
                      ) : (
                        <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-300">Failed</span>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No {progressStatus === 'all' ? '' : `${progressStatus} `}progress records match this scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Performance Trend — real term data */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <LineChartIcon size={24} className="text-blue-400" />
                <h2 className="text-lg font-bold text-slate-100">Performance Trend by Term</h2>
              </div>
              <WidgetHelp title="Performance Trend by Term" description="Shows institution-wide average score and pass rate across terms so leadership can monitor academic movement over time." />
            </div>
            {termTrend.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-slate-500">No term data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={termTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="term" tick={{ fontSize: 11 }}>
                    <Label value="Term" position="insideBottom" offset={-5} />
                  </XAxis>
                  <YAxis domain={[0, 100]}>
                    <Label value="Percentage (%)" angle={-90} position="insideLeft" />
                  </YAxis>
                  <Tooltip formatter={(v) => `${Number(v ?? 0)}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="avg_score" stroke="#3b82f6" strokeWidth={2} name="Avg Score" />
                  <Line type="monotone" dataKey="pass_rate" stroke="#10b981" strokeWidth={2} name="Pass Rate" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Department Performance Distribution */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PieChart size={24} className="text-purple-400" />
                <h2 className="text-lg font-bold text-slate-100">Department Distribution</h2>
              </div>
              <WidgetHelp title="Department Distribution" description="Shows how department average performance is distributed, helping compare departmental contribution and strength." />
            </div>
            {departmentChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChartComponent>
                  <Pie
                    data={departmentChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {departmentChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChartComponent>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-500">
                No data available
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-100">Competency Heatmap</h2>
              <WidgetHelp title="Competency Heatmap" description="Shows student and competency performance using low, medium, and high mastery color coding for rapid institutional diagnosis." />
            </div>
            <CompetencyHeatmap items={advanced?.heatmap?.items || []} />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-100">Institutional Recommendations</h2>
              <WidgetHelp title="Institutional Recommendations" description="Shows rule-based intervention ideas generated from cohort risk, competency weakness, and overall learning patterns." />
            </div>
            <InsightsPanel items={advanced?.recommendations?.items || []} previewCount={3} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6 lg:col-span-1">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-100">Attendance Correlation</h2>
              <WidgetHelp title="Attendance Correlation" description="Shows the relationship between attendance rates and academic scores across learners, useful for early-warning analysis." />
            </div>
            <AttendanceCorrelationChart items={advanced?.attendance_correlation?.items || []} />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6 lg:col-span-1">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-100">Portfolio Tracking</h2>
              <WidgetHelp title="Portfolio Tracking" description="Shows completion levels for digital portfolio evidence so missing submissions can be tracked at a glance." />
            </div>
            <PortfolioStatusPanel portfolio={advanced?.portfolio || { items: [], last_updated: '' }} />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6 lg:col-span-1">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-100">Cohort Comparison</h2>
              <WidgetHelp title="Cohort Comparison" description="Compares two cohorts side by side using average score, making it easier to evaluate relative performance." />
            </div>
            <CohortComparisonChart items={(comparison?.cohorts || []).map((cohort) => ({ subject_name: cohort.subject_name, average_score: cohort.average_score }))} />
          </div>
        </div>

        {/* Department Performance Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={24} className="text-emerald-400" />
                <h2 className="text-lg font-bold text-slate-100">Department Performance</h2>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={departmentSort}
                  onChange={(event) => setDepartmentSort(event.target.value as typeof departmentSort)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300"
                >
                  <option value="highest">Highest performance first</option>
                  <option value="lowest">Needs attention first</option>
                  <option value="students">Largest department first</option>
                </select>
                <WidgetHelp title="Department Performance" description="Tabulates department-level learner count, average score, and pass rate to support institutional benchmarking." />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                    Students
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                    Avg Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                    Pass Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {departments.length > 0 ? (
                  sortedDepartments.map((dept, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/60">
                      <td className="px-6 py-4 font-medium text-slate-200">{dept.name}</td>
                      <td className="px-6 py-4 text-slate-400">{dept.students_count.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                          dept.avg_score >= 75
                            ? 'bg-green-100 text-green-800'
                            : dept.avg_score >= 70
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}>
                          {dept.avg_score}%
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-green-600 font-semibold">{dept.pass_rate}%</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
                      No department data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* At-Risk Students */}
        {atRisk.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow overflow-hidden mb-8">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={20} className="text-orange-400" />
                <h2 className="text-lg font-bold text-slate-100">At-Risk Students (avg &lt; 50%)</h2>
              </div>
              <WidgetHelp title="At-Risk Students" description="Lists learners whose average score is below the risk threshold, helping leaders focus intervention resources." />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800 border-b border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Avg Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {atRisk.map((s) => (
                    <tr key={s.student_id} className="hover:bg-red-900/20">
                      <td className="px-6 py-3 font-medium text-slate-200">{s.name}</td>
                      <td className="px-6 py-3">
                        <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-bold">{s.avg_score}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <button onClick={() => navigate('/users')} className="p-4 bg-slate-900 border border-blue-800 rounded-lg hover:bg-blue-900/40 transition text-left">
            <p className="font-semibold text-slate-100">👥 Manage Users</p>
            <p className="text-sm text-slate-400 mt-1">Create/edit user accounts</p>
          </button>
          <button onClick={() => navigate('/institutions')} className="p-4 bg-slate-900 border border-purple-800 rounded-lg hover:bg-purple-900/40 transition text-left">
            <p className="font-semibold text-slate-100">🏫 Institutions</p>
            <p className="text-sm text-slate-400 mt-1">Manage institution data</p>
          </button>
          <button onClick={() => navigate('/departments')} className="p-4 bg-slate-900 border border-cyan-800 rounded-lg hover:bg-cyan-900/40 transition text-left">
            <p className="font-semibold text-slate-100">🏢 Departments</p>
            <p className="text-sm text-slate-400 mt-1">Manage department data</p>
          </button>
          <button onClick={() => navigate('/progress')} className="p-4 bg-slate-900 border border-green-800 rounded-lg hover:bg-green-900/40 transition text-left">
            <p className="font-semibold text-slate-100">📶 Progress Tracking</p>
            <p className="text-sm text-slate-400 mt-1">Prioritize learner progress</p>
          </button>
          <button onClick={() => navigate('/admin/analytics')} className="p-4 bg-slate-900 border border-emerald-800 rounded-lg hover:bg-emerald-900/40 transition text-left">
            <p className="font-semibold text-slate-100">📊 Analytics</p>
            <p className="text-sm text-slate-400 mt-1">View system analytics</p>
          </button>
          <button onClick={() => navigate('/admin/reports/exam-results')} className="p-4 bg-slate-900 border border-orange-800 rounded-lg hover:bg-orange-900/40 transition text-left">
            <p className="font-semibold text-slate-100">📈 Exam Results</p>
            <p className="text-sm text-slate-400 mt-1">School-wide report</p>
          </button>
        </div>
      </div>
    </div>
  );
}
