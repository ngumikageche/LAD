import { useState, useEffect } from 'react';
import { User, Mail, BookOpen, TrendingUp, AlertCircle, MessageSquare, Download } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { trainerStudentsAPI, trainerPerformanceAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';

interface StudentProfile {
  id: string;
  name: string;
  email: string;
  student_id: string;
  enrollment_status: string;
  subjects: string[];
  overall_avg: number;
  assessments_taken: number;
}

const mockPerformanceData = [
  { week: 'Week 1', score: 65 },
  { week: 'Week 2', score: 68 },
  { week: 'Week 3', score: 72 },
  { week: 'Week 4', score: 70 },
  { week: 'Week 5', score: 75 },
  { week: 'Week 6', score: 78 },
];

const mockSubjectPerformance = [
  { subject: 'Math', score: 75 },
  { subject: 'Physics', score: 72 },
  { subject: 'Chemistry', score: 70 },
  { subject: 'English', score: 80 },
  { subject: 'History', score: 78 },
];

export default function TrainerStudentProfilePage() {
  const { user } = useAuth();
  const [studentId] = useState('STU001'); // In real app, this would come from URL params
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStudent = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await trainerStudentsAPI.getStudentProfile(studentId);
        setStudent(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load student profile');
      } finally {
        setLoading(false);
      }
    };

    loadStudent();
  }, [studentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <p className="text-red-600 text-lg">Student not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header with Student Info */}
        <div className="bg-white rounded-lg shadow p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-3xl font-bold">
                {student.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{student.name}</h1>
                <p className="text-gray-600">Student ID: {student.student_id}</p>
              </div>
            </div>

            {error && (
              <div className="text-red-600 flex items-center gap-2">
                <AlertCircle size={24} />
                {error}
              </div>
            )}
          </div>

          {/* Contact & Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b">
            <div>
              <p className="text-gray-600 text-sm">Email</p>
              <p className="font-medium text-gray-900 flex items-center gap-2 mt-2">
                <Mail size={18} className="text-blue-500" />
                <a href={`mailto:${student.email}`} className="text-blue-600 hover:underline">
                  {student.email}
                </a>
              </p>
            </div>
            <div>
              <p className="text-gray-600 text-sm">Enrollment Status</p>
              <p className="font-medium text-gray-900 mt-2 capitalize">
                {student.enrollment_status}
              </p>
            </div>
            <div>
              <p className="text-gray-600 text-sm">Subjects Enrolled</p>
              <p className="font-medium text-gray-900 mt-2">
                {student.subjects.length} subject{student.subjects.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Performance Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-blue-700 text-sm font-medium">Overall Average</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">
                {student.overall_avg.toFixed(1)}%
              </p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-purple-700 text-sm font-medium">Assessments Taken</p>
              <p className="text-3xl font-bold text-purple-600 mt-2">
                {student.assessments_taken}
              </p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-green-700 text-sm font-medium">Status</p>
              <p className={`text-lg font-bold mt-2 ${
                student.overall_avg >= 70 ? 'text-green-600' : 'text-orange-600'
              }`}>
                {student.overall_avg >= 70 ? '✓ On Track' : '⚠ Needs Support'}
              </p>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg">
              <p className="text-yellow-700 text-sm font-medium">Trend</p>
              <p className="text-lg font-bold text-yellow-600 mt-2">
                📈 Improving
              </p>
            </div>
          </div>
        </div>

        {/* Performance Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Performance Over Time */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp size={24} className="text-blue-500" />
              Performance Trend
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mockPerformanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Subject Performance */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BookOpen size={24} className="text-purple-500" />
              Performance by Subject
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={mockSubjectPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="subject" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="score" fill="#a855f7" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Enrolled Subjects */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Enrolled Subjects</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {student.subjects.map((subject, idx) => (
              <div key={idx} className="p-4 border rounded-lg hover:bg-gray-50 transition">
                <p className="font-semibold text-gray-900">{subject}</p>
                <div className="flex gap-4 mt-2 text-sm text-gray-600">
                  <span>Avg: 75%</span>
                  <span>•</span>
                  <span>Assessments: 5</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Scores Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div className="p-6 border-b">
            <h2 className="text-lg font-bold text-gray-900">Recent Assessment Scores</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Assessment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  { name: 'Quiz 1', subject: 'Math', score: 78, status: 'Passed', date: '2024-04-15' },
                  { name: 'Midterm', subject: 'Physics', score: 82, status: 'Passed', date: '2024-04-10' },
                  { name: 'Assignment', subject: 'Chemistry', score: 75, status: 'Passed', date: '2024-04-05' },
                ].map((score, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{score.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{score.subject}</td>
                    <td className="px-6 py-4 text-sm font-bold text-blue-600">{score.score}%</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold">
                        {score.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{score.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2">
            <MessageSquare size={20} />
            Send Message
          </button>
          <button className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center justify-center gap-2">
            <MessageSquare size={20} />
            Provide Feedback
          </button>
          <button className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium flex items-center justify-center gap-2">
            <Download size={20} />
            Export Profile
          </button>
          <button className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-medium flex items-center justify-center gap-2">
            ⚠️ Mark At-Risk
          </button>
        </div>

        {/* Notes Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Trainer Notes</h2>
          <textarea
            defaultValue="Strong student with good performance trend. Shows improvement in recent assessments. Encourage participation in advanced topics."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={4}
          />
          <button className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
            Save Notes
          </button>
        </div>
      </div>
    </div>
  );
}
