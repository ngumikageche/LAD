import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, Download, Mail, MessageSquare, TrendingUp, User } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Label, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

type DeliveryChannel = 'system' | 'email' | 'sms';
type ComposerMode = 'message' | 'feedback';

const TrainerStudentProfilePage = () => {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>('message');
  const [composerTitle, setComposerTitle] = useState('');
  const [composerBody, setComposerBody] = useState('');
  const [composerSubmitting, setComposerSubmitting] = useState(false);
  const [composerSuccess, setComposerSuccess] = useState<string | null>(null);
  const [deliveryChannels, setDeliveryChannels] = useState<Record<DeliveryChannel, boolean>>({
    system: true,
    email: false,
    sms: false,
  });

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

  const openComposer = (mode: ComposerMode) => {
    setComposerMode(mode);
    setComposerTitle(mode === 'message' ? 'Student update' : 'Performance feedback');
    setComposerBody('');
    setDeliveryChannels({ system: true, email: false, sms: false });
    setComposerSuccess(null);
    setComposerOpen(true);
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setComposerSubmitting(false);
  };

  const handleSendToStudent = async () => {
    if (!student) return;
    if (!composerTitle.trim() || !composerBody.trim()) {
      setError('Title and message are required');
      return;
    }
    const selectedChannels = (Object.entries(deliveryChannels)
      .filter(([, enabled]) => enabled)
      .map(([channel]) => channel) as DeliveryChannel[]);
    if (selectedChannels.length === 0) {
      setError('Select at least one delivery channel');
      return;
    }

    try {
      setComposerSubmitting(true);
      setError(null);
      await trainerStudentsAPI.createStudentReport(student.id, {
        title: composerTitle.trim(),
        body: composerBody.trim(),
        report_type: composerMode === 'message' ? 'message' : 'academic',
        delivery_channels: selectedChannels,
      });
      setComposerSuccess(`${composerMode === 'message' ? 'Message' : 'Feedback'} sent via ${selectedChannels.join(', ')}.`);
      closeComposer();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to send ${composerMode}`);
    } finally {
      setComposerSubmitting(false);
    }
  };

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
          {composerSuccess ? (
            <div className="mb-6 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-green-300">
              {composerSuccess}
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
                <XAxis dataKey="label">
                  <Label value="Check Point" position="insideBottom" offset={-5} />
                </XAxis>
                <YAxis>
                  <Label value="Score (%)" angle={-90} position="insideLeft" />
                </YAxis>
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
                <XAxis dataKey="subject">
                  <Label value="Subject" position="insideBottom" offset={-5} />
                </XAxis>
                <YAxis>
                  <Label value="Score (%)" angle={-90} position="insideLeft" />
                </YAxis>
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
          <button
            onClick={() => openComposer('message')}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition hover:bg-blue-700"
          >
            <MessageSquare size={20} />
            Send Message
          </button>
          <button
            onClick={() => openComposer('feedback')}
            className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 font-medium text-white transition hover:bg-green-700"
          >
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

        {composerOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-xl rounded-lg border border-slate-800 bg-slate-900 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-800 p-6">
                <h2 className="text-xl font-bold text-slate-100">
                  {composerMode === 'message' ? 'Send Message' : 'Provide Feedback'}
                </h2>
                <button onClick={closeComposer} className="text-2xl text-slate-400 hover:text-slate-100">×</button>
              </div>
              <div className="space-y-4 p-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">Title</label>
                  <input
                    type="text"
                    value={composerTitle}
                    onChange={(event) => setComposerTitle(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    {composerMode === 'message' ? 'Message' : 'Feedback'}
                  </label>
                  <textarea
                    value={composerBody}
                    onChange={(event) => setComposerBody(event.target.value)}
                    rows={5}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
                    placeholder={composerMode === 'message' ? 'Write the message for this student...' : 'Write feedback for this student...'}
                  />
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                  <p className="mb-3 text-sm font-medium text-slate-200">Delivery Channels</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {(['system', 'email', 'sms'] as const).map((channel) => (
                      <label key={channel} className="flex items-center gap-2 text-sm capitalize text-slate-300">
                        <input
                          type="checkbox"
                          checked={deliveryChannels[channel]}
                          onChange={(event) => setDeliveryChannels((current) => ({ ...current, [channel]: event.target.checked }))}
                          className="h-4 w-4 rounded accent-blue-500"
                        />
                        {channel}
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    `System` sends an in-app notification. `Email` and `SMS` use the student contact information on file.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 border-t border-slate-800 p-6">
                <button
                  onClick={handleSendToStudent}
                  disabled={composerSubmitting}
                  className="flex-1 rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {composerSubmitting ? 'Sending...' : composerMode === 'message' ? 'Send Message' : 'Send Feedback'}
                </button>
                <button
                  onClick={closeComposer}
                  className="rounded-lg bg-slate-700 px-6 py-2 font-medium text-slate-300 transition hover:bg-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TrainerStudentProfilePage;
