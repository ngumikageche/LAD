import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, AlertCircle, Filter, Download } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import { adminAnalyticsAPI } from '../api/admin';

interface AnalyticsData {
  course: string;
  pass_rate: number;
  avg_score: number;
  students: number;
  trend: number;
}

interface StudentPerformance {
  student_id: string;
  name: string;
  avg_score: number;
  courses_count: number;
  status: 'excellent' | 'good' | 'average' | 'at_risk';
}

const mockCourseAnalytics: AnalyticsData[] = [
  { course: 'Mathematics', pass_rate: 82, avg_score: 76, students: 120, trend: 5 },
  { course: 'Physics', pass_rate: 78, avg_score: 72, students: 95, trend: -2 },
  { course: 'Chemistry', pass_rate: 85, avg_score: 79, students: 110, trend: 8 },
  { course: 'Biology', pass_rate: 80, avg_score: 75, students: 105, trend: 3 },
  { course: 'English', pass_rate: 88, avg_score: 82, students: 115, trend: 6 },
  { course: 'History', pass_rate: 75, avg_score: 70, students: 90, trend: -3 },
];

const mockStudentPerformance: StudentPerformance[] = [
  { student_id: 'STU001', name: 'Alice Johnson', avg_score: 92, courses_count: 5, status: 'excellent' },
  { student_id: 'STU002', name: 'Bob Smith', avg_score: 78, courses_count: 5, status: 'good' },
  { student_id: 'STU003', name: 'Charlie Brown', avg_score: 65, courses_count: 4, status: 'average' },
  { student_id: 'STU004', name: 'Diana Prince', avg_score: 55, courses_count: 5, status: 'at_risk' },
  { student_id: 'STU005', name: 'Evan Davis', avg_score: 88, courses_count: 5, status: 'excellent' },
];

export default function AdminSystemAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData[]>([]);
  const [studentPerformance, setStudentPerformance] = useState<StudentPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'semester'>('month');

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Mock data for now
        const data = await adminAnalyticsAPI.getSystemAnalytics();
        setAnalytics(mockCourseAnalytics);
        setStudentPerformance(mockStudentPerformance);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, [dateRange]);

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
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 size={32} className="text-indigo-500" />
              System Analytics & Reporting
            </h1>
            <p className="text-gray-600 mt-2">Comprehensive institutional performance analysis</p>
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
        <div className="mb-6 flex gap-4 bg-white p-4 rounded-lg shadow">
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-indigo-600" />
            <span className="font-medium text-gray-700">Time Period:</span>
          </div>
          {(['week', 'month', 'semester'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-4 py-2 rounded-lg transition capitalize font-medium ${
                dateRange === range
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {range}
            </button>
          ))}
        </div>

        {/* Key Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">System Average</p>
            <p className="text-3xl font-bold text-indigo-600 mt-2">76.2%</p>
            <p className="text-xs text-green-600 mt-2">↑ 2.3% vs last month</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">Overall Pass Rate</p>
            <p className="text-3xl font-bold text-green-600 mt-2">81.5%</p>
            <p className="text-xs text-green-600 mt-2">↑ 1.8% vs last month</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">At-Risk Students</p>
            <p className="text-3xl font-bold text-orange-600 mt-2">145</p>
            <p className="text-xs text-red-600 mt-2">↑ 5 new alerts</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">Active Courses</p>
            <p className="text-3xl font-bold text-purple-600 mt-2">156</p>
            <p className="text-xs text-gray-600 mt-2">Across all departments</p>
          </div>
        </div>

        {/* Course Performance vs Pass Rate */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Course Performance</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="course" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="avg_score" fill="#3b82f6" name="Avg Score" />
                <Bar dataKey="pass_rate" fill="#10b981" name="Pass Rate" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Student Performance Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="avg_score" name="Average Score" />
                <YAxis dataKey="courses_count" name="Courses Enrolled" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter
                  name="Students"
                  data={studentPerformance}
                  fill="#8884d8"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Course Analytics Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
          <div className="p-6 border-b">
            <h2 className="text-lg font-bold text-gray-900">Detailed Course Analytics</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Course</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Students</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Avg Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Pass Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Trend</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {analytics.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{item.course}</td>
                    <td className="px-6 py-4 text-gray-600">{item.students}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        item.avg_score >= 75
                          ? 'bg-green-100 text-green-800'
                          : item.avg_score >= 70
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}>
                        {item.avg_score}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-green-600 font-semibold">{item.pass_rate}%</td>
                    <td className="px-6 py-4">
                      <span className={`font-semibold ${item.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.trend > 0 ? '↑' : '↓'} {Math.abs(item.trend)}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        item.pass_rate >= 80
                          ? 'bg-green-100 text-green-800'
                          : item.pass_rate >= 70
                            ? 'bg-yellow-100 text-yellow-800'
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
        </div>

        {/* At-Risk Students Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <AlertCircle size={24} className="text-orange-500" />
              At-Risk Students Analysis
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Average</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Courses</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {studentPerformance
                  .filter(s => s.status === 'at_risk' || s.status === 'average')
                  .map((student, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">{student.name}</td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-bold">
                          {student.avg_score}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{student.courses_count}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          student.status === 'at_risk'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {student.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button className="text-blue-600 hover:text-blue-900 font-medium">
                          Contact Trainer
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
