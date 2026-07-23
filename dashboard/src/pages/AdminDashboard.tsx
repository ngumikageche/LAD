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
  course_id?: string | null;
  module_id?: string | null;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#f87171'];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<DashboardScopeFilters>({});
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
        setSubjectOptions((Array.isArray(subjects) ? subjects : []).map((item) => ({ id: String(item.id), name: item.name ?? 'Unnamed subject', module_id: item.module_id ?? null, course_id: item.course_id ?? null })));
        setTrainerOptions((Array.isArray(trainers) ? trainers : []).map((item) => ({ id: String(item.id), name: item.user?.name ?? item.name ?? 'Unnamed trainer' })));
        setStudentOptions((Array.isArray(students) ? students : []).map((item) => ({ id: String(item.id), name: item.user?.name ?? item.name ?? 'Unnamed student' })));
      } catch (err) {
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

  const sortedDepartments = useMemo(() => [...departments].sort((a, b) => {
    if (departmentSort === 'lowest') return a.avg_score - b.avg_score;
    if (departmentSort === 'students') return b.students_count - a.students_count;
    return b.avg_score - a.avg_score;
  }), [departments, departmentSort]);

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
              <h2 className="text-lg font-semibold text-slate-100">Dashboard scope</h2>
            </div>
            <button
              type="button"
              onClick={() => setScope({})}
              className="self-start rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              Clear filters
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-2 text-sm text-slate-400">
              <span>Course</span>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-500"
                value={scope.course_id ?? ''}
                onChange={(event) => updateScope({ course_id: event.target.value || undefined }, ['module_id', 'subject_id'])}
              >
                <option value="">All courses</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-400">
              <span>Module</span>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-500"
                value={scope.module_id ?? ''}
                onChange={(event) => updateScope({ module_id: event.target.value || undefined }, ['subject_id'])}
              >
                <option value="">All modules</option>
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
                onChange={(event) => updateScope({ subject_id: event.target.value || undefined })}
              >
                <option value="">All subjects</option>
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
                onChange={(event) => updateScope({ trainer_id: event.target.value || undefined })}
              >
                <option value="">All trainers</option>
                {trainerOptions.map((trainer) => (
                  <option key={trainer.id} value={trainer.id}>{trainer.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-400">
              <span>Student</span>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-500"
                value={scope.student_id ?? ''}
                onChange={(event) => updateScope({ student_id: event.target.value || undefined })}
              >
                <option value="">All students</option>
                {studentOptions.map((student) => (
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
