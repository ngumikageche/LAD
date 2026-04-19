import { useState, useEffect } from 'react';
import { BarChart3, Users, BookOpen, AlertCircle, TrendingDown, Activity } from 'lucide-react';
import { trainerDashboardAPI, trainerSubjectsAPI, trainerAlertsAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';

interface DashboardStats {
  assigned_subjects: number;
  total_students: number;
  recent_scores_count: number;
  at_risk_count: number;
  avg_class_performance: number;
}

interface RecentSubject {
  id: string;
  name: string;
  students_count: number;
  avg_score: number;
}

interface AtRiskAlert {
  student_name: string;
  severity: 'critical' | 'high' | 'medium';
  subject: string;
}

export default function TrainerDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentSubjects, setRecentSubjects] = useState<RecentSubject[]>([]);
  const [atRiskAlerts, setAtRiskAlerts] = useState<AtRiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError(null);

        const [statsData, subjectsData, alertsData] = await Promise.all([
          trainerDashboardAPI.getDashboardStats(),
          trainerSubjectsAPI.getAssignedSubjects(),
          trainerAlertsAPI.getAtRiskStudents(),
        ]);

        setStats(statsData);
        setRecentSubjects(
          subjectsData.slice(0, 3).map((s) => ({
            id: s.id,
            name: s.subject_name,
            students_count: s.students_count,
            avg_score: s.avg_score,
          }))
        );
        setAtRiskAlerts(
          alertsData.slice(0, 5).map((a) => ({
            student_name: a.student_name,
            severity: a.severity,
            subject: a.weak_subjects[0] || 'General',
          }))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            👨‍🏫 Teaching Dashboard
          </h1>
          <p className="text-gray-600 mt-2">
            Welcome back! Here's an overview of your teaching workload.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Assigned Subjects</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats?.assigned_subjects || 0}
                </p>
              </div>
              <BookOpen size={32} className="text-blue-500 opacity-80" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Students</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats?.total_students || 0}
                </p>
              </div>
              <Users size={32} className="text-green-500 opacity-80" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Recent Scores</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats?.recent_scores_count || 0}
                </p>
              </div>
              <BarChart3 size={32} className="text-purple-500 opacity-80" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">At-Risk Students</p>
                <p className="text-3xl font-bold text-red-600 mt-2">
                  {stats?.at_risk_count || 0}
                </p>
              </div>
              <AlertCircle size={32} className="text-red-500 opacity-80" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Class Avg Performance</p>
                <p className="text-3xl font-bold text-indigo-600 mt-2">
                  {stats?.avg_class_performance.toFixed(1)}%
                </p>
              </div>
              <TrendingDown size={32} className="text-indigo-500 opacity-80" />
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Subjects */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BookOpen size={24} className="text-blue-500" />
              Your Subjects
            </h2>
            <div className="space-y-4">
              {recentSubjects.map((subject) => (
                <div
                  key={subject.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">
                      {subject.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {subject.students_count} students
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">
                      {subject.avg_score.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-600">Class Average</p>
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              View All Subjects
            </button>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium text-sm">
                ⬆️ Upload Scores
              </button>
              <button className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm">
                👥 View Students
              </button>
              <button className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium text-sm">
                📊 Analytics
              </button>
              <button className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium text-sm">
                ⚠️ At-Risk Students
              </button>
              <button className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-medium text-sm">
                📋 Generate Report
              </button>
            </div>
          </div>
        </div>

        {/* At-Risk Alerts */}
        {atRiskAlerts.length > 0 && (
          <div className="mt-6 bg-red-50 border-l-4 border-red-500 rounded-lg p-6">
            <h2 className="text-lg font-bold text-red-900 mb-4 flex items-center gap-2">
              <AlertCircle size={24} />
              ⚠️ Students Needing Attention
            </h2>
            <div className="space-y-3">
              {atRiskAlerts.map((alert, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-white rounded border border-red-200"
                >
                  <div>
                    <p className="font-semibold text-gray-900">
                      {alert.student_name}
                    </p>
                    <p className="text-sm text-gray-600">{alert.subject}</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                      alert.severity === 'critical'
                        ? 'bg-red-200 text-red-800'
                        : alert.severity === 'high'
                          ? 'bg-orange-200 text-orange-800'
                          : 'bg-yellow-200 text-yellow-800'
                    }`}
                  >
                    {alert.severity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Activity size={24} className="text-blue-500" />
            Recent Activity
          </h2>
          <div className="space-y-3">
            <div className="flex gap-4 pb-3 border-b">
              <div className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0"></div>
              <div>
                <p className="font-medium text-gray-900">Scores uploaded for Math 301</p>
                <p className="text-sm text-gray-600">2 hours ago</p>
              </div>
            </div>
            <div className="flex gap-4 pb-3 border-b">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
              <div>
                <p className="font-medium text-gray-900">Report generated for Physics II</p>
                <p className="text-sm text-gray-600">5 hours ago</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-2 h-2 rounded-full bg-purple-500 mt-2 flex-shrink-0"></div>
              <div>
                <p className="font-medium text-gray-900">
                  Feedback provided to 3 students
                </p>
                <p className="text-sm text-gray-600">Yesterday</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
