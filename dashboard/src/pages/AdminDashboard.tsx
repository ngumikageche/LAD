import { useState, useEffect } from 'react';
import { Users, BookOpen, Building2, TrendingUp, AlertCircle, BarChart3, PieChart, LineChart as LineChartIcon } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart as PieChartComponent, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { adminDashboardAPI, adminAnalyticsAPI } from '../api/admin';

interface DashboardMetric {
  label: string;
  value: number;
  icon: any;
  color: string;
  bgColor: string;
  trend?: number;
}

interface DepartmentPerformance {
  department_id: string;
  name: string;
  avg_score: number;
  students_count: number;
  pass_rate: number;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#f87171'];

const performanceTrendData = [
  { month: 'Jan', avg_score: 72, pass_rate: 78 },
  { month: 'Feb', avg_score: 74, pass_rate: 80 },
  { month: 'Mar', avg_score: 76, pass_rate: 82 },
  { month: 'Apr', avg_score: 75, pass_rate: 81 },
  { month: 'May', avg_score: 78, pass_rate: 84 },
  { month: 'Jun', avg_score: 80, pass_rate: 86 },
];

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [departments, setDepartments] = useState<DepartmentPerformance[]>([]);
  const [departmentChartData, setDepartmentChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch real data from API
        const [dashboardData, departmentsData] = await Promise.all([
          adminDashboardAPI.getDashboardStats(),
          adminAnalyticsAPI.getDepartmentsAnalytics(),
        ]);

        // Build metrics from real data
        setMetrics([
          {
            label: 'Total Students',
            value: dashboardData.system_overview?.total_students || 0,
            icon: Users,
            color: 'text-blue-600',
            bgColor: 'bg-blue-100',
            trend: 12,
          },
          {
            label: 'Active Trainers',
            value: dashboardData.system_overview?.total_trainers || 0,
            icon: Users,
            color: 'text-purple-600',
            bgColor: 'bg-purple-100',
            trend: 5,
          },
          {
            label: 'Total Courses',
            value: dashboardData.system_overview?.total_courses || 0,
            icon: BookOpen,
            color: 'text-amber-600',
            bgColor: 'bg-amber-100',
            trend: 8,
          },
          {
            label: 'Departments',
            value: dashboardData.system_overview?.total_institutions || 0,
            icon: Building2,
            color: 'text-emerald-600',
            bgColor: 'bg-emerald-100',
            trend: 2,
          },
        ]);

        // Transform department data
        const formattedDepts = (departmentsData || []).map((dept: any, idx: number) => ({
          department_id: dept.department_id,
          name: dept.name,
          avg_score: Math.round(dept.avg_score || 0),
          students_count: dept.students_count || 0,
          pass_rate: Math.round(dept.pass_rate || 0),
        }));

        setDepartments(formattedDepts);

        // Create pie chart data from departments
        const chartData = formattedDepts.map((dept: any, idx: number) => ({
          name: dept.name,
          value: dept.avg_score,
          fill: COLORS[idx % COLORS.length],
        }));
        setDepartmentChartData(chartData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        // Use empty data on error
        setMetrics([]);
        setDepartments([]);
        setDepartmentChartData([]);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-2">System overview and institutional analytics</p>
        </div>

        {/* Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {metrics.map((metric, idx) => {
            const Icon = metric.icon;
            return (
              <div key={idx} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
                <div className="flex items-center justify-between mb-4">
                  <div className={`${metric.bgColor} p-3 rounded-lg`}>
                    <Icon className={`${metric.color}`} size={24} />
                  </div>
                  {metric.trend && (
                    <span className="text-green-600 font-semibold text-sm">
                      ↑ {metric.trend}%
                    </span>
                  )}
                </div>
                <p className="text-gray-600 text-sm">{metric.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{metric.value.toLocaleString()}</p>
              </div>
            );
          })}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Performance Trend */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <LineChartIcon size={24} className="text-blue-500" />
              Performance Trend
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={performanceTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="avg_score" stroke="#3b82f6" strokeWidth={2} name="Avg Score" />
                <Line type="monotone" dataKey="pass_rate" stroke="#10b981" strokeWidth={2} name="Pass Rate" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Department Performance Distribution */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <PieChart size={24} className="text-purple-500" />
              Department Distribution
            </h2>
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
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                No data available
              </div>
            )}
          </div>
        </div>

        {/* Department Performance Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
          <div className="p-6 border-b">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 size={24} className="text-emerald-500" />
              Department Performance
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Students
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Avg Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Pass Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {departments.length > 0 ? (
                  departments.map((dept, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">{dept.name}</td>
                      <td className="px-6 py-4 text-gray-600">{dept.students_count.toLocaleString()}</td>
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
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      No department data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button className="p-4 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition text-left">
            <p className="font-semibold text-gray-900">👥 Manage Users</p>
            <p className="text-sm text-gray-600 mt-1">Create/edit user accounts</p>
          </button>
          <button className="p-4 bg-white border border-purple-200 rounded-lg hover:bg-purple-50 transition text-left">
            <p className="font-semibold text-gray-900">🏫 Institutions</p>
            <p className="text-sm text-gray-600 mt-1">Manage institution data</p>
          </button>
          <button className="p-4 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50 transition text-left">
            <p className="font-semibold text-gray-900">📊 Analytics</p>
            <p className="text-sm text-gray-600 mt-1">View system analytics</p>
          </button>
          <button className="p-4 bg-white border border-orange-200 rounded-lg hover:bg-orange-50 transition text-left">
            <p className="font-semibold text-gray-900">📢 Announcements</p>
            <p className="text-sm text-gray-600 mt-1">Create system announcements</p>
          </button>
        </div>
      </div>
    </div>
  );
}
