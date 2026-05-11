import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, AlertCircle, Filter, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { adminAnalyticsAPI } from '../api/admin';
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
  };
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

export default function AdminSystemAnalyticsPage() {
  const [courseAnalytics, setCourseAnalytics] = useState<CourseAnalytics[]>([]);
  const [deptAnalytics, setDeptAnalytics] = useState<DepartmentAnalytics[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'semester'>('month');

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);
        const [courses, depts, dashboard] = await Promise.all([
          adminAnalyticsAPI.getCoursesAnalytics() as Promise<CourseAnalytics[]>,
          adminAnalyticsAPI.getDepartmentsAnalytics() as Promise<DepartmentAnalytics[]>,
          adminAnalyticsAPI.getDashboard() as Promise<DashboardStats>,
        ]);
        setCourseAnalytics(Array.isArray(courses) ? courses : []);
        setDeptAnalytics(Array.isArray(depts) ? depts : []);
        setDashboardStats(dashboard);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    loadAnalytics();
  }, []);

  const courseTc = useTableControls(courseAnalytics);
  const deptTc = useTableControls(deptAnalytics);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
              <BarChart3 size={32} className="text-indigo-500" />
              System Analytics & Reporting
            </h1>
            <p className="text-slate-400 mt-2">Comprehensive institutional performance analysis</p>
          </div>
          <button className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium flex items-center gap-2">
            <Download size={20} />
            Export Report
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex gap-4 bg-slate-900 border border-slate-800 p-4 rounded-lg shadow">
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-indigo-600" />
            <span className="font-medium text-slate-300">Time Period:</span>
          </div>
          {(['week', 'month', 'semester'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-4 py-2 rounded-lg transition capitalize font-medium ${
                dateRange === range
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {range}
            </button>
          ))}
        </div>

        {/* Key Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <p className="text-slate-400 text-sm">System Average</p>
            <p className="text-3xl font-bold text-indigo-600 mt-2">
              {dashboardStats ? `${dashboardStats.academic_metrics.overall_avg}%` : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-2">{dashboardStats?.academic_metrics.total_assessments ?? 0} total assessments</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <p className="text-slate-400 text-sm">Overall Pass Rate</p>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {dashboardStats ? `${dashboardStats.academic_metrics.overall_pass_rate}%` : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-2">{dashboardStats?.academic_metrics.passed_count ?? 0} passed / {dashboardStats?.academic_metrics.failed_count ?? 0} failed</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <p className="text-slate-400 text-sm">Total Students</p>
            <p className="text-3xl font-bold text-orange-600 mt-2">
              {dashboardStats?.system_overview.total_students ?? '—'}
            </p>
            <p className="text-xs text-slate-500 mt-2">{dashboardStats?.system_overview.total_trainers ?? 0} trainers</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <p className="text-slate-400 text-sm">Active Courses</p>
            <p className="text-3xl font-bold text-purple-600 mt-2">
              {dashboardStats?.system_overview.total_courses ?? '—'}
            </p>
            <p className="text-xs text-slate-500 mt-2">{dashboardStats?.system_overview.total_departments ?? 0} departments · {dashboardStats?.system_overview.active_terms ?? 0} active terms</p>
          </div>
        </div>

        {/* Course Performance vs Pass Rate */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-4">Course Performance</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={courseAnalytics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="avg_score" fill="#3b82f6" name="Avg Score" />
                <Bar dataKey="pass_rate" fill="#10b981" name="Pass Rate" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-4">Department Performance</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={deptAnalytics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="avg_score" fill="#8b5cf6" name="Avg Score" />
                <Bar dataKey="pass_rate" fill="#f59e0b" name="Pass Rate" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Course Analytics Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow overflow-hidden mb-8">
          <div className="p-6 border-b">
            <h2 className="text-lg font-bold text-slate-100">Detailed Course Analytics</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <SortableTh label="Course" sortKey="name" sort={courseTc.sort} onSort={courseTc.setSort} />
                  <SortableTh label="Enrolled" sortKey="enrolled_count" sort={courseTc.sort} onSort={courseTc.setSort} />
                  <SortableTh label="Scores" sortKey="scores_count" sort={courseTc.sort} onSort={courseTc.setSort} />
                  <SortableTh label="Avg Score" sortKey="avg_score" sort={courseTc.sort} onSort={courseTc.setSort} />
                  <SortableTh label="Pass Rate" sortKey="pass_rate" sort={courseTc.sort} onSort={courseTc.setSort} />
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {courseTc.paged.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-4 text-center text-slate-500">No data available</td></tr>
                ) : courseTc.paged.map((item) => (
                  <tr key={item.course_id} className="hover:bg-slate-800">
                    <td className="px-6 py-4 font-medium text-slate-100">{item.name}</td>
                    <td className="px-6 py-4 text-slate-400">{item.enrolled_count}</td>
                    <td className="px-6 py-4 text-slate-400">{item.scores_count}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        item.avg_score >= 75 ? 'bg-green-100 text-green-800'
                          : item.avg_score >= 70 ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {item.avg_score}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-green-600 font-semibold">{item.pass_rate}%</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        item.pass_rate >= 80 ? 'bg-green-100 text-green-800'
                          : item.pass_rate >= 70 ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {item.pass_rate >= 80 ? 'Excellent' : item.pass_rate >= 70 ? 'Good' : 'Needs Attention'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TableFooter page={courseTc.page} totalPages={courseTc.totalPages} total={courseTc.total} pageSize={courseTc.pageSize} onPage={courseTc.setPage} />
        </div>

        {/* Department Analytics Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Users size={24} className="text-purple-500" />
              Department Analytics
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <SortableTh label="Department" sortKey="name" sort={deptTc.sort} onSort={deptTc.setSort} />
                  <SortableTh label="Students" sortKey="students_count" sort={deptTc.sort} onSort={deptTc.setSort} />
                  <SortableTh label="Courses" sortKey="courses_count" sort={deptTc.sort} onSort={deptTc.setSort} />
                  <SortableTh label="Avg Score" sortKey="avg_score" sort={deptTc.sort} onSort={deptTc.setSort} />
                  <SortableTh label="Pass Rate" sortKey="pass_rate" sort={deptTc.sort} onSort={deptTc.setSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {deptTc.paged.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-4 text-center text-slate-500">No data available</td></tr>
                ) : deptTc.paged.map((dept) => (
                  <tr key={dept.department_id} className="hover:bg-slate-800">
                    <td className="px-6 py-4 font-medium text-slate-100">{dept.name}</td>
                    <td className="px-6 py-4 text-slate-400">{dept.students_count}</td>
                    <td className="px-6 py-4 text-slate-400">{dept.courses_count}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        dept.avg_score >= 75 ? 'bg-green-100 text-green-800'
                          : dept.avg_score >= 70 ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {dept.avg_score}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-green-600 font-semibold">{dept.pass_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TableFooter page={deptTc.page} totalPages={deptTc.totalPages} total={deptTc.total} pageSize={deptTc.pageSize} onPage={deptTc.setPage} />
        </div>
      </div>
    </div>
  );
}
