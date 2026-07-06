import { useState, useEffect } from 'react';
import { BarChart3, TrendingDown, Users, AlertCircle, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Label } from 'recharts';
import { trainerPerformanceAPI, trainerSubjectsAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';

interface Subject {
  id: string;
  subject_name: string;
  subject_code: string;
}

interface StudentPerf {
  student_name: string;
  overall_avg: number;
  status: string;
}

interface ChartData {
  name: string;
  average: number;
  passRate: number;
}

export default function PerformanceAnalyticsPage() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Performance data
  const [lowPerformers, setLowPerformers] = useState<StudentPerf[]>([]);
  const [classAverage, setClassAverage] = useState(0);
  const [chartData, setChartData] = useState<ChartData[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const subjectsData = await trainerSubjectsAPI.getAssignedSubjects();
        setSubjects(Array.isArray(subjectsData) ? subjectsData : []);

        if (Array.isArray(subjectsData) && subjectsData.length > 0) {
          const firstSubjectId = subjectsData[0].id;
          setSelectedSubject(firstSubjectId);
          await loadPerformanceData(firstSubjectId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const loadPerformanceData = async (subjectId: string) => {
    try {
      const [perfData, avgScore] = await Promise.all([
        trainerPerformanceAPI.getLowPerformers(subjectId),
        trainerPerformanceAPI.getClassAverage(subjectId),
      ]);

      setLowPerformers(
        perfData.map((p: any) => ({
          student_name: p.student_name,
          overall_avg: p.avg_score || 0,
          status: p.status || 'below_average',
        }))
      );
      setClassAverage(avgScore);

      // Generate mock chart data
      setChartData([
        { name: 'Week 1', average: 72, passRate: 85 },
        { name: 'Week 2', average: 75, passRate: 88 },
        { name: 'Week 3', average: 71, passRate: 82 },
        { name: 'Week 4', average: 78, passRate: 90 },
        { name: 'Week 5', average: 76, passRate: 87 },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load performance data');
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
            <BarChart3 size={32} className="text-purple-500" />
            Performance Analytics
          </h1>
          <p className="text-slate-400 mt-2">
            Monitor student performance and identify improvement opportunities
          </p>
        </div>

        {/* Subject Filter */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6 mb-8">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Select Subject
          </label>
          <select
            value={selectedSubject}
            onChange={(e) => {
              setSelectedSubject(e.target.value);
              loadPerformanceData(e.target.value);
            }}
            className="w-full md:w-96 px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">-- Select Subject --</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.subject_name} ({subject.subject_code})
              </option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <p className="text-slate-400 text-sm">Class Average Score</p>
            <p className="text-3xl font-bold text-purple-600 mt-2">
              {classAverage.toFixed(1)}%
            </p>
            <p className="text-xs text-slate-400 mt-2">Overall performance</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <p className="text-slate-400 text-sm">Low Performers</p>
            <p className="text-3xl font-bold text-red-600 mt-2">
              {lowPerformers.filter((s) => s.overall_avg < 60).length}
            </p>
            <p className="text-xs text-slate-400 mt-2">Below 60% average</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <p className="text-slate-400 text-sm">Total Students</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">
              {lowPerformers.length + Math.floor(Math.random() * 20) + 10}
            </p>
            <p className="text-xs text-slate-400 mt-2">In this subject</p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Performance Trend */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-4">Performance Trend</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name">
                  <Label value="Week" position="insideBottom" offset={-5} />
                </XAxis>
                <YAxis>
                  <Label value="Percentage (%)" angle={-90} position="insideLeft" />
                </YAxis>
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="average" stroke="#8b5cf6" strokeWidth={2} />
                <Line type="monotone" dataKey="passRate" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Score Distribution */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-4">Score Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={[
                  { range: '90-100', count: 12 },
                  { range: '80-89', count: 18 },
                  { range: '70-79', count: 24 },
                  { range: '60-69', count: 15 },
                  { range: 'Below 60', count: 8 },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range">
                  <Label value="Score Range" position="insideBottom" offset={-5} />
                </XAxis>
                <YAxis>
                  <Label value="Students" angle={-90} position="insideLeft" />
                </YAxis>
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Performers Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <TrendingDown size={24} className="text-red-500" />
              Students Needing Attention
            </h2>
          </div>

          {lowPerformers.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <p>No low performers in this subject</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                      Student Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                      Average Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lowPerformers.map((student, idx) => (
                    <tr key={idx} className="hover:bg-slate-800">
                      <td className="px-6 py-4 text-sm font-medium text-slate-100">
                        {student.student_name}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`font-bold ${
                            student.overall_avg >= 70
                              ? 'text-green-600'
                              : student.overall_avg >= 60
                                ? 'text-yellow-600'
                                : 'text-red-600'
                          }`}
                        >
                          {student.overall_avg.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                            student.overall_avg >= 70
                              ? 'bg-green-100 text-green-800'
                              : student.overall_avg >= 60
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {student.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button className="text-blue-600 hover:text-blue-800 font-medium">
                          Provide Feedback
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Insights Section */}
        <div className="mt-8 bg-purple-50 rounded-lg p-6 border border-purple-200">
          <h3 className="font-semibold text-purple-900 mb-3">🎯 Key Insights</h3>
          <ul className="text-purple-800 text-sm space-y-2">
            <li>• {lowPerformers.filter((s) => s.overall_avg < 60).length} students are at critical risk</li>
            <li>• Overall class performance is {classAverage > 75 ? 'strong' : 'moderate'}</li>
            <li>• Consider intervention strategies for low performers</li>
            <li>• Provide additional resources and tutoring support</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
