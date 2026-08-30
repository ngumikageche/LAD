import { useEffect, useMemo, useState } from 'react';
import { FileText, Send, AlertCircle, CheckCircle2, User, Mail, BarChart3 } from 'lucide-react';
import { apiRequest } from '../api/client';
import { trainerStudentsAPI, trainerSubjectsAPI, type StudentWrittenReport } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';
import { useSearchParams } from 'react-router-dom';

interface Student {
  id: string;
  name: string;
  email: string;
  student_id: string;
  overall_avg: number;
}

interface SubjectOption {
  id: string;
  label: string;
}

type AdminSubjectRow = {
  id: string;
  name: string;
};

type TrainerSubjectRow = {
  id: string;
  subject_name: string;
};

export default function ProvideFeedbackPage() {
  const { token, user } = useAuth();
  const [searchParams] = useSearchParams();
  // Trainers are scoped to the learners in their own subjects; every other
  // role that holds `reports.student.write` (admin, manager, registrar) sees
  // the full learner list.
  const isTrainer = Boolean(user?.trainer_id);
  const seesAllStudents = !isTrainer;
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [reportType, setReportType] = useState<StudentWrittenReport['report_type']>('general');
  const [reportBody, setReportBody] = useState('');
  const [handwrittenFeedback, setHandwrittenFeedback] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reportHistory, setReportHistory] = useState<StudentWrittenReport[]>([]);
  const [deliveryChannels, setDeliveryChannels] = useState({
    system: true,
    email: true,
    sms: false,
  });

  useEffect(() => {
    const loadStudents = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = seesAllStudents
          ? await trainerStudentsAPI.getAllStudentsForReports()
          : await trainerStudentsAPI.getStudentsInSubjects();
        setStudents(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load students');
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, [seesAllStudents]);

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        const items: Array<AdminSubjectRow | TrainerSubjectRow> = seesAllStudents
          ? await apiRequest<AdminSubjectRow[]>('/subjects', { token })
          : await trainerSubjectsAPI.getAssignedSubjects();
        setSubjects((Array.isArray(items) ? items : []).map((item) => ({
          id: item.id,
          label: 'subject_name' in item ? item.subject_name : item.name,
        })));
      } catch {
        setSubjects([]);
      }
    };

    if (token) {
      loadSubjects();
    }
  }, [seesAllStudents, token]);

  const historySummary = useMemo(() => {
    return reportHistory.reduce<Record<string, number>>((acc, item) => {
      acc[item.report_type] = (acc[item.report_type] ?? 0) + 1;
      return acc;
    }, {});
  }, [reportHistory]);

  const handleSelectStudent = async (student: Student) => {
    setSelectedStudent(student);
    setSelectedSubjectId('');
    setReportTitle('');
    setReportBody('');
    setReportType('general');
    setDeliveryChannels({ system: true, email: true, sms: false });
    setHandwrittenFeedback(null);
    setError(null);
    try {
      const reports = await trainerStudentsAPI.getStudentReports(student.id);
      setReportHistory(Array.isArray(reports) ? reports : []);
    } catch (err) {
      setReportHistory([]);
      setError(err instanceof Error ? err.message : 'Failed to load student reports');
    }
  };

  useEffect(() => {
    const studentId = searchParams.get('student_id');
    if (!studentId || students.length === 0 || selectedStudent?.id === studentId) return;
    const student = students.find((item) => item.id === studentId);
    if (student) {
      void handleSelectStudent(student);
      const subjectId = searchParams.get('subject_id');
      if (subjectId) setSelectedSubjectId(subjectId);
    }
  }, [searchParams, students, selectedStudent?.id]);

  const handleSubmitReport = async () => {
    if (!selectedStudent || !reportTitle.trim() || !reportBody.trim()) {
      setError('Please select a student and complete the report title and body');
      return;
    }
    if (!deliveryChannels.system && !deliveryChannels.email && !deliveryChannels.sms) {
      setError('Select at least one delivery option: system, email, or SMS.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      let report = await trainerStudentsAPI.createStudentReport(selectedStudent.id, {
        title: reportTitle.trim(),
        body: reportBody.trim(),
        report_type: reportType,
        subject_id: selectedSubjectId || undefined,
        delivery_channels: (Object.entries(deliveryChannels)
          .filter(([, enabled]) => enabled)
          .map(([channel]) => channel) as Array<'system' | 'email' | 'sms'>),
      });
      if (handwrittenFeedback) {
        report = await trainerStudentsAPI.uploadHandwrittenFeedback(
          selectedStudent.id,
          report.id,
          handwrittenFeedback,
        );
      }

      const selectedChannels = Object.entries(deliveryChannels)
        .filter(([, enabled]) => enabled)
        .map(([channel]) => channel.toUpperCase())
        .join(', ');
      setSuccess(`Student report saved. Selected feedback option(s): ${selectedChannels}.`);
      setReportTitle('');
      setReportBody('');
      setSelectedSubjectId('');
      setHandwrittenFeedback(null);
      setReportHistory([report, ...reportHistory]);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save report');
    } finally {
      setSubmitting(false);
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
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
            <FileText size={32} className="text-cyan-500" />
            Student Reports
          </h1>
          <p className="text-slate-400 mt-2">
            Write a specific report for an individual learner
          </p>
        </div>

        {/* Alert Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-300">
            <CheckCircle2 size={20} />
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Student List */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow overflow-hidden">
            <div className="p-6 border-b border-slate-700 bg-slate-800">
              <h2 className="text-lg font-bold text-slate-100">{seesAllStudents ? 'Students' : 'My Students'}</h2>
              <p className="text-sm text-slate-400 mt-1">
                {students.length} student{students.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="overflow-y-auto max-h-[600px]">
              {students.map((student) => (
                <button
                  key={student.id}
                  onClick={() => handleSelectStudent(student)}
                  className={`w-full text-left p-4 border-b transition ${
                    selectedStudent?.id === student.id
                      ? 'bg-blue-500/15 border-blue-300'
                      : 'hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  <p className="font-semibold text-slate-100">{student.name}</p>
                  <p className="text-xs text-slate-400 mt-1">{student.email}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-400">{student.student_id}</span>
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        student.overall_avg >= 70
                          ? 'bg-green-500/15 text-green-300'
                          : student.overall_avg >= 60
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-red-500/15 text-red-300'
                      }`}
                    >
                      {student.overall_avg.toFixed(1)}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Form */}
          <div className="lg:col-span-2 space-y-6">
            {selectedStudent ? (
              <>
                {/* Selected Student Info */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
                    <User size={24} className="text-blue-500" />
                    {selectedStudent.name}
                  </h2>

                  <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-slate-800">
                    <div>
                      <p className="text-sm text-slate-400">Email</p>
                      <p className="font-medium text-slate-100 flex items-center gap-2 mt-1">
                        <Mail size={16} />
                        {selectedStudent.email}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Current Average</p>
                      <p className="font-bold text-lg text-blue-400 flex items-center gap-2 mt-1">
                        <BarChart3 size={16} />
                        {selectedStudent.overall_avg.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400">Student ID: {selectedStudent.student_id}</p>
                </div>

                {/* Report Form */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-slate-100 mb-4">Write Student Report</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Report Title
                      </label>
                      <input
                        value={reportTitle}
                        onChange={(e) => setReportTitle(e.target.value)}
                        placeholder="e.g. Weekly progress update"
                        className="w-full px-4 py-3 bg-slate-800 text-slate-100 border border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Report Type
                      </label>
                      <select
                        value={reportType}
                        onChange={(e) => setReportType(e.target.value as StudentWrittenReport['report_type'])}
                        className="w-full px-4 py-3 bg-slate-800 text-slate-100 border border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      >
                        <option value="general">General</option>
                        <option value="academic">Academic</option>
                        <option value="attendance">Attendance</option>
                        <option value="behaviour">Behaviour</option>
                        <option value="support">Support Plan</option>
                        <option value="progress">Progress</option>
                        <option value="message">Message</option>
                        </select>
                      </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Subject
                      </label>
                      <select
                        value={selectedSubjectId}
                        onChange={(e) => setSelectedSubjectId(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-800 text-slate-100 border border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      >
                        <option value="">General / no subject</option>
                        {subjects.map((subject) => (
                          <option key={subject.id} value={subject.id}>{subject.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Report Body
                    </label>
                    <textarea
                      value={reportBody}
                      onChange={(e) => setReportBody(e.target.value)}
                      placeholder="Write the report for this student..."
                      rows={6}
                      className="w-full px-4 py-3 bg-slate-800 text-slate-100 border border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                    <p className="text-xs text-slate-400 mt-2">
                      {reportBody.length}/5000 characters
                    </p>
                  </div>

                  <div className="mb-4 rounded-lg border border-slate-700 bg-slate-800/70 p-4">
                    <label className="block text-sm font-medium text-slate-200">
                      Handwritten feedback photo
                    </label>
                    <p className="mt-1 text-xs text-slate-400">
                      Optional. Photograph the trainer’s handwritten remarks and attach them to this learner report.
                    </p>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                      capture="environment"
                      onChange={(event) => setHandwrittenFeedback(event.target.files?.[0] ?? null)}
                      className="mt-3 block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-4 file:py-2 file:font-semibold file:text-white"
                    />
                    {handwrittenFeedback ? (
                      <p className="mt-2 text-xs text-cyan-300">Selected: {handwrittenFeedback.name}</p>
                    ) : null}
                  </div>

                  <div className="mb-4 rounded-lg border border-slate-700 bg-slate-800/70 p-4">
                    <p className="text-sm font-medium text-slate-200 mb-3">Feedback Options</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      {([
                        ['system', 'System'],
                        ['email', 'Email'],
                        ['sms', 'SMS'],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={deliveryChannels[key]}
                            onChange={(event) => setDeliveryChannels((current) => ({ ...current, [key]: event.target.checked }))}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      `System` creates an in-app notification. `Email` and `SMS` are also selectable delivery paths.
                    </p>
                  </div>

                  {/* Send Button */}
                  <button
                    onClick={handleSubmitReport}
                    disabled={submitting || !reportTitle.trim() || !reportBody.trim()}
                    className="w-full px-6 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                  >
                    <Send size={20} />
                    {submitting ? 'Saving...' : 'Save Student Report'}
                  </button>
                </div>

                {/* Report History */}
                {reportHistory.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <h3 className="text-lg font-bold text-slate-100">Previous Reports</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(historySummary).map(([type, count]) => (
                          <span key={type} className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 capitalize">
                            {type}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-4">
                      {reportHistory.map((item) => (
                        <div
                          key={item.id}
                          className="p-4 bg-slate-800 rounded-lg border-l-4 border-blue-500"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium text-slate-100">{item.title}</p>
                            <span className="px-2 py-1 bg-blue-500/15 text-blue-300 rounded text-xs font-bold capitalize">
                              {item.report_type}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mb-2">
                            {item.created_at ? new Date(item.created_at).toLocaleString() : 'Just now'}
                            {item.subject_name ? ` • ${item.subject_name}` : ''}
                          </p>
                          <p className="text-slate-300 text-sm whitespace-pre-line">{item.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-12 text-center col-span-2">
                <FileText size={48} className="mx-auto text-slate-500 mb-4" />
                <p className="text-slate-500 text-lg">Select a student to write a report</p>
              </div>
            )}
          </div>
        </div>

        {/* Best Practices */}
        <div className="mt-8 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-6">
          <h3 className="mb-3 font-semibold text-cyan-200">💬 Effective Feedback Tips</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              ['Be Specific', 'Reference specific assignments or concepts'],
              ['Be Constructive', 'Focus on improvement rather than criticism'],
              ['Be Timely', 'Provide feedback as soon as possible after assessment'],
              ['Be Encouraging', 'Balance criticism with praise for effort'],
            ].map(([title, detail]) => (
              <div key={title} className="text-sm text-slate-300">
                <p className="mb-1 font-medium text-cyan-200">✓ {title}</p>
                <p className="text-slate-400">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
