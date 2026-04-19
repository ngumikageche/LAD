import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingDown, MessageSquare, BookOpen, AlertCircle, Filter } from 'lucide-react';
import { trainerAlertsAPI, trainerSubjectsAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';

interface AtRiskStudent {
  student_id: string;
  student_name: string;
  current_avg: number;
  trend: 'declining' | 'stable' | 'improving';
  weak_subjects: string[];
  recent_scores: number[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface Subject {
  id: string;
  subject_name: string;
  subject_code: string;
}

export default function AtRiskStudentsPage() {
  const { user } = useAuth();
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'high' | 'medium'>('all');
  const [filterSubject, setFilterSubject] = useState('all');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [alertsData, subjectsData] = await Promise.all([
          trainerAlertsAPI.getAtRiskStudents(),
          trainerSubjectsAPI.getAssignedSubjects(),
        ]);

        setStudents(Array.isArray(alertsData) ? alertsData : []);
        setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load at-risk students');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const filteredStudents = students.filter((student) => {
    const matchSeverity = filterSeverity === 'all' || student.severity === filterSeverity;
    const matchSubject =
      filterSubject === 'all' ||
      student.weak_subjects.some((s) => s.includes(filterSubject));
    return matchSeverity && matchSubject;
  });

  const stats = {
    critical: students.filter((s) => s.severity === 'critical').length,
    high: students.filter((s) => s.severity === 'high').length,
    medium: students.filter((s) => s.severity === 'medium').length,
    declining: students.filter((s) => s.trend === 'declining').length,
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', badge: 'bg-red-100' };
      case 'high':
        return { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', badge: 'bg-orange-100' };
      case 'medium':
        return { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', badge: 'bg-yellow-100' };
      default:
        return { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', badge: 'bg-blue-100' };
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'declining':
        return <TrendingDown size={20} className="text-red-500" />;
      case 'improving':
        return <TrendingDown size={20} className="text-green-500 rotate-180" />;
      default:
        return <div className="w-5 h-5 text-gray-400">↔</div>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle size={32} className="text-red-500" />
            Students At Risk
          </h1>
          <p className="text-gray-600 mt-2">
            Monitor and support students showing signs of academic struggle
          </p>
        </div>

        {/* Alert Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-red-100 rounded-lg shadow p-6 border-l-4 border-red-500">
            <p className="text-red-700 text-sm font-medium">Critical</p>
            <p className="text-3xl font-bold text-red-700 mt-2">{stats.critical}</p>
            <p className="text-xs text-red-600 mt-1">Immediate action needed</p>
          </div>

          <div className="bg-orange-100 rounded-lg shadow p-6 border-l-4 border-orange-500">
            <p className="text-orange-700 text-sm font-medium">High Risk</p>
            <p className="text-3xl font-bold text-orange-700 mt-2">{stats.high}</p>
            <p className="text-xs text-orange-600 mt-1">Close monitoring</p>
          </div>

          <div className="bg-yellow-100 rounded-lg shadow p-6 border-l-4 border-yellow-500">
            <p className="text-yellow-700 text-sm font-medium">Medium Risk</p>
            <p className="text-3xl font-bold text-yellow-700 mt-2">{stats.medium}</p>
            <p className="text-xs text-yellow-600 mt-1">Supportive intervention</p>
          </div>

          <div className="bg-blue-100 rounded-lg shadow p-6 border-l-4 border-blue-500">
            <p className="text-blue-700 text-sm font-medium">Declining Trend</p>
            <p className="text-3xl font-bold text-blue-700 mt-2">{stats.declining}</p>
            <p className="text-xs text-blue-600 mt-1">Worsening performance</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Filter size={16} />
                Filter by Severity
              </label>
              <select
                value={filterSeverity}
                onChange={(e) =>
                  setFilterSeverity(e.target.value as typeof filterSeverity)
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Severity Levels</option>
                <option value="critical">Critical</option>
                <option value="high">High Risk</option>
                <option value="medium">Medium Risk</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <BookOpen size={16} />
                Filter by Subject
              </label>
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Subjects</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.subject_name}>
                    {subject.subject_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Students List */}
        {filteredStudents.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <AlertTriangle size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">No at-risk students found</p>
            <p className="text-gray-400">All your students are performing well!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredStudents.map((student) => {
              const colors = getSeverityColor(student.severity);
              return (
                <div
                  key={student.student_id}
                  className={`rounded-lg shadow-md overflow-hidden border-l-4 ${colors.border} ${colors.bg}`}
                >
                  <div className="p-6">
                    {/* Header Row */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900">
                          {student.student_name}
                        </h3>
                        <p className="text-sm text-gray-600">ID: {student.student_id}</p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`px-4 py-2 rounded-full text-sm font-bold uppercase ${colors.badge} ${colors.text}`}
                        >
                          {student.severity}
                        </span>
                      </div>
                    </div>

                    {/* Performance Info */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 pb-4 border-t border-gray-300">
                      <div className="pt-4">
                        <p className="text-sm text-gray-600">Current Average</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {student.current_avg.toFixed(1)}%
                        </p>
                      </div>

                      <div className="pt-4">
                        <p className="text-sm text-gray-600">Trend</p>
                        <div className="flex items-center gap-2 mt-2">
                          {getTrendIcon(student.trend)}
                          <span className="font-medium text-gray-900 capitalize">
                            {student.trend}
                          </span>
                        </div>
                      </div>

                      <div className="pt-4">
                        <p className="text-sm text-gray-600">Weak Subjects</p>
                        <p className="font-medium text-gray-900">
                          {student.weak_subjects.length}
                        </p>
                      </div>

                      <div className="pt-4">
                        <p className="text-sm text-gray-600">Recent Scores</p>
                        <p className="text-sm font-mono text-gray-900">
                          {student.recent_scores.slice(0, 3).join(', ')}
                        </p>
                      </div>
                    </div>

                    {/* Weak Subjects Tags */}
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Subjects Needing Support:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {student.weak_subjects.map((subject, idx) => (
                          <span
                            key={idx}
                            className="inline-block px-3 py-1 bg-white text-gray-700 rounded-full text-sm border border-gray-300"
                          >
                            {subject}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4 border-t border-gray-300">
                      <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2">
                        <MessageSquare size={18} />
                        Send Message
                      </button>
                      <button className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center justify-center gap-2">
                        <BookOpen size={18} />
                        Provide Support
                      </button>
                      <button className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium">
                        View Profile
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Recommendations */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">📋 Recommended Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <p className="font-semibold text-red-900 mb-2">For Critical Students:</p>
              <ul className="text-sm text-red-800 space-y-1">
                <li>• Schedule immediate one-on-one meetings</li>
                <li>• Identify specific learning gaps</li>
                <li>• Create personalized study plans</li>
                <li>• Provide tutoring or additional resources</li>
              </ul>
            </div>

            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <p className="font-semibold text-orange-900 mb-2">For High Risk Students:</p>
              <ul className="text-sm text-orange-800 space-y-1">
                <li>• Monitor performance closely</li>
                <li>• Offer additional study sessions</li>
                <li>• Encourage peer tutoring groups</li>
                <li>• Track progress week by week</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
