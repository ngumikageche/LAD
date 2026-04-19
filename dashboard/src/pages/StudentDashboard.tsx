import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Target,
  BookOpen,
  Award,
} from 'lucide-react';
import { studentAnalytics } from '../api/student';
import { useAuth } from '../auth/AuthContext';

interface PerformanceData {
  overall_avg: number;
  total_assessments: number;
  passed_count: number;
  failed_count: number;
  avg_by_subject: Array<{
    name: string;
    avg: number;
    total_marks: number;
  }>;
  avg_by_term: Array<{
    term: string;
    avg: number;
  }>;
}

interface TrendData {
  term: string;
  avg: number;
  trend: 'improving' | 'declined' | 'stable';
}

interface WeakSubject {
  subject: string;
  avg_score: number;
  status: 'poor' | 'fair' | 'needs_improvement' | 'good';
}

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [weakSubjects, setWeakSubjects] = useState<WeakSubject[]>([]);

  useEffect(() => {
    if (!user?.id) return;

    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [perfData, trendData, weakData] = await Promise.all([
          studentAnalytics.getPerformanceSummary(user.id),
          studentAnalytics.getPerformanceTrends(user.id),
          studentAnalytics.getWeakSubjects(user.id),
        ]);

        setPerformance(perfData);
        setTrends(trendData.trend_data || []);
        setWeakSubjects(weakData.weak_subjects || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load dashboard'
        );
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const passRate = performance
    ? (performance.passed_count / performance.total_assessments * 100).toFixed(1)
    : '0';

  const subjectChartData = performance?.avg_by_subject.map((s) => ({
    name: s.name,
    avg: parseFloat(s.avg.toFixed(1)),
  })) || [];

  const trendChartData = trends.map((t) => ({
    name: t.term,
    performance: parseFloat(t.avg.toFixed(1)),
  }));

  const passFailData = [
    { name: 'Passed', value: performance?.passed_count || 0 },
    { name: 'Failed', value: performance?.failed_count || 0 },
  ];

  const colors = ['#10b981', '#ef4444'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome, {user?.name}! 👋
          </h1>
          <p className="text-gray-600 mt-2">
            Here's your academic performance overview
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Overall Average"
            value={`${performance?.overall_avg.toFixed(1)}%`}
            icon={<Award className="text-blue-500" />}
            color="bg-blue-50"
          />
          <StatCard
            label="Assessments Taken"
            value={`${performance?.total_assessments}`}
            icon={<BookOpen className="text-purple-500" />}
            color="bg-purple-50"
          />
          <StatCard
            label="Pass Rate"
            value={`${passRate}%`}
            icon={<CheckCircle2 className="text-green-500" />}
            color="bg-green-50"
          />
          <StatCard
            label="Failed"
            value={`${performance?.failed_count}`}
            icon={<AlertCircle className="text-red-500" />}
            color="bg-red-50"
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Average by Subject */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Average Score by Subject
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={subjectChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="avg" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pass/Fail Pie */}
          <div className="bg-white rounded-lg shadow-md p-6 flex flex-col items-center">
            <h2 className="text-xl font-bold text-gray-900 mb-4 w-full">
              Results Distribution
            </h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={passFailData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ value }) => `${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {colors.map((color, index) => (
                    <Cell key={`cell-${index}`} fill={color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance Trends */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp size={24} className="text-blue-500" />
            Performance Trends
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="performance"
                stroke="#3b82f6"
                dot={{ fill: '#3b82f6', r: 6 }}
                activeDot={{ r: 8 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Weak Subjects Alert */}
        {weakSubjects.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-amber-900 mb-4 flex items-center gap-2">
              <Target size={24} />
              Subjects Needing Improvement
            </h2>
            <div className="space-y-3">
              {weakSubjects.map((subject, idx) => (
                <div
                  key={idx}
                  className="bg-white p-4 rounded-lg flex justify-between items-center"
                >
                  <div>
                    <p className="font-semibold text-gray-900">
                      {subject.subject}
                    </p>
                    <p className="text-sm text-gray-600">
                      Average: {subject.avg_score.toFixed(1)}%
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
                    {subject.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className={`${color} rounded-lg p-6 shadow-md`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  );
}
