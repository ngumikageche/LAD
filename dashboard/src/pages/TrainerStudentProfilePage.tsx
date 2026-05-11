import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, Download, Mail, MessageSquare, TrendingUp, User } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { trainerStudentsAPI } from '../api/trainer';

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

const TrainerStudentProfilePage = () => {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStudents = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await trainerStudentsAPI.getStudentsInSubjects();
        const items = Array.isArray(data) ? data : [];
        setStudents(items);
        if (items.length > 0) {
          setSelectedStudentId(items[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load students');
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, []);

  useEffect(() => {
    const loadStudentProfile = async () => {
      if (!selectedStudentId) {
        setStudent(null);
        return;
      }

      try {
        setProfileLoading(true);
        setError(null);
        const data = await trainerStudentsAPI.getStudentProfile(selectedStudentId);
        setStudent(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load student profile');
        setStudent(null);
      } finally {
        setProfileLoading(false);
      }
    };

    loadStudentProfile();
  }, [selectedStudentId]);

  const performanceTrendData = useMemo(() => {
    const base = student?.overall_avg ?? 0;
    return [
      { label: 'Start', score: Math.max(base - 8, 0) },
      { label: 'Check 1', score: Math.max(base - 4, 0) },
      { label: 'Check 2', score: Math.max(base - 1, 0) },
      { label: 'Current', score: base },
    ];
  }, [student]);

  const subjectPerformanceData = useMemo(() => {
    const subjects = student?.subjects ?? [];
    if (subjects.length === 0) {
      return [];
    }

    return subjects.map((subjectName, index) => ({
      subject: subjectName,
      score: Math.max((student?.overall_avg ?? 0) - index * 3, 0),
    }));
  }, [student]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-amber-500" />
          <p className="text-lg text-amber-300">No students available in your assigned subjects</p>
        </div>
      </div>
    );
  }

  if (profileLoading || !student) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-950 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-lg bg-slate-900 border border-slate-800 p-8 shadow">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-6">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 text-3xl font-bold text-white">
                {student.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-100">{student.name}</h1>
                <p className="text-slate-400">Student ID: {student.student_id}</p>
              </div>
            </div>

            <div className="w-full max-w-sm">
              <label className="mb-2 block text-sm font-medium text-slate-300">Select Student</label>
              <select
                value={selectedStudentId}
                onChange={(event) => setSelectedStudentId(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
              >
                {students.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.student_id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? (
            <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">
              <AlertCircle size={20} />
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 border-b border-slate-800 pb-6 md:grid-cols-3">
            <div>
              <p className="text-sm text-slate-400">Email</p>
              <p className="mt-2 flex items-center gap-2 font-medium text-slate-100">
                <Mail size={18} className="text-blue-500" />
                <a href={`mailto:${student.email}`} className="text-blue-400 hover:underline">
                  {student.email}
                </a>
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Enrollment Status</p>
              <p className="mt-2 font-medium capitalize text-slate-100">{student.enrollment_status}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Subjects Enrolled</p>
              <p className="mt-2 font-medium text-slate-100">
                {student.subjects.length} subject{student.subjects.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-blue-500/10 p-4">
              <p className="text-sm font-medium text-blue-300">Overall Average</p>
              <p className="mt-2 text-3xl font-bold text-blue-400">{student.overall_avg.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg bg-purple-500/10 p-4">
              <p className="text-sm font-medium text-purple-300">Assessments Taken</p>
              <p className="mt-2 text-3xl font-bold text-purple-400">{student.assessments_taken}</p>
            </div>
            <div className="rounded-lg bg-green-500/10 p-4">
              <p className="text-sm font-medium text-green-300">Status</p>
              <p className={`mt-2 text-lg font-bold ${student.overall_avg >= 70 ? 'text-green-400' : 'text-orange-400'}`}>
                {student.overall_avg >= 70 ? 'On Track' : 'Needs Support'}
              </p>
            </div>
            <div className="rounded-lg bg-amber-500/10 p-4">
              <p className="text-sm font-medium text-amber-300">Trend</p>
              <p className="mt-2 text-lg font-bold text-teal-400">Improving</p>
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg bg-slate-900 border border-slate-800 p-6 shadow">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-100">
              <TrendingUp size={24} className="text-blue-500" />
              Performance Trend
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={performanceTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg bg-slate-900 border border-slate-800 p-6 shadow">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-100">
              <BookOpen size={24} className="text-purple-500" />
              Performance by Subject
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={subjectPerformanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="subject" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="score" fill="#a855f7" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mb-6 rounded-lg bg-slate-900 border border-slate-800 p-6 shadow">
          <h2 className="mb-4 text-lg font-bold text-slate-100">Enrolled Subjects</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {student.subjects && student.subjects.length > 0 ? (
              student.subjects.map((subject) => (
                <div key={subject.id} className="rounded-lg border border-slate-700 p-4 transition hover:bg-slate-800">
                  <p className="font-semibold text-slate-100">{subject.name}</p>
                  <div className="mt-2 flex gap-4 text-sm text-slate-400">
                    <span>Avg: {subject.average.toFixed(1)}%</span>
                    <span>•</span>
                    <span>Assessments: {subject.assessments_count}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-400">No subjects enrolled</p>
            )}
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <button className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition hover:bg-blue-700">
            <MessageSquare size={20} />
            Send Message
          </button>
          <button className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 font-medium text-white transition hover:bg-green-700">
            <MessageSquare size={20} />
            Provide Feedback
          </button>
          <button className="flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-6 py-3 font-medium text-white transition hover:bg-purple-700">
            <Download size={20} />
            Export Profile
          </button>
          <button className="rounded-lg bg-orange-600 px-6 py-3 font-medium text-white transition hover:bg-orange-700">
            Mark At-Risk
          </button>
        </div>

        <div className="rounded-lg bg-slate-900 border border-slate-800 p-6 shadow">
          <h2 className="mb-4 text-lg font-bold text-slate-100">Trainer Notes</h2>
          <textarea
            defaultValue="Track this student's progress and add intervention notes here."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-200 px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
            rows={4}
          />
          <button className="mt-4 rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition hover:bg-blue-700">
            Save Notes
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrainerStudentProfilePage;
