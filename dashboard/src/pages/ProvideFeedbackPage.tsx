import { useState, useEffect } from 'react';
import { MessageSquare, Send, Save, AlertCircle, CheckCircle2, User, Mail, BarChart3 } from 'lucide-react';
import { trainerStudentsAPI, trainerScoresAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';

interface Student {
  id: string;
  name: string;
  email: string;
  student_id: string;
  overall_avg: number;
}

interface FeedbackEntry {
  student_id: string;
  score_id: string;
  feedback: string;
}

export default function ProvideFeedbackPage() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackHistory, setFeedbackHistory] = useState<any[]>([]);

  useEffect(() => {
    const loadStudents = async () => {
      try {
        setLoading(true);
        const data = await trainerStudentsAPI.getStudentsInSubjects();
        setStudents(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load students');
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, []);

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student);
    setFeedbackText('');
    // Mock feedback history
    setFeedbackHistory([
      { date: '2024-04-10', feedback: 'Great improvement in recent assessments!', score: 82 },
      { date: '2024-03-28', feedback: 'Focus on conceptual understanding', score: 68 },
    ]);
  };

  const handleSubmitFeedback = async () => {
    if (!selectedStudent || !feedbackText.trim()) {
      setError('Please select a student and enter feedback');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      
      // Here we would call the API to save feedback
      // For now, simulating the call
      await trainerScoresAPI.provideFeedback(selectedStudent.id, feedbackText);
      
      setSuccess('Feedback sent successfully!');
      setFeedbackText('');
      setFeedbackHistory([
        { date: new Date().toISOString().split('T')[0], feedback: feedbackText, score: 0 },
        ...feedbackHistory,
      ]);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send feedback');
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
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
            <MessageSquare size={32} className="text-cyan-500" />
            Provide Feedback
          </h1>
          <p className="text-slate-400 mt-2">
            Guide students with constructive feedback on their performance
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
            <div className="p-6 border-b bg-slate-800">
              <h2 className="text-lg font-bold text-slate-100">My Students</h2>
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

                  <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b">
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

                {/* Feedback Form */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-slate-100 mb-4">Write Feedback</h3>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Feedback Message
                    </label>
                    <textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Provide constructive feedback to guide the student's improvement..."
                      rows={6}
                      className="w-full px-4 py-3 border border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                    <p className="text-xs text-slate-400 mt-2">
                      {feedbackText.length}/500 characters
                    </p>
                  </div>

                  {/* Feedback Templates */}
                  <div className="mb-4 p-4 bg-blue-500/10 rounded-lg">
                    <p className="text-sm font-medium text-blue-900 mb-2">💡 Suggested Focus Areas:</p>
                    <div className="space-y-2">
                      <button
                        onClick={() =>
                          setFeedbackText(
                            feedbackText +
                            '\n- Focus on understanding fundamental concepts before moving to advanced topics.\n'
                          )
                        }
                        className="text-left text-xs text-blue-300 hover:text-blue-300 w-full"
                      >
                        • Suggest reviewing fundamentals
                      </button>
                      <button
                        onClick={() =>
                          setFeedbackText(
                            feedbackText +
                            '\n- Great effort! Continue practicing regularly to improve your performance.\n'
                          )
                        }
                        className="text-left text-xs text-blue-300 hover:text-blue-300 w-full"
                      >
                        • Encourage consistent practice
                      </button>
                      <button
                        onClick={() =>
                          setFeedbackText(
                            feedbackText +
                            '\n- Excellent work! You are showing strong understanding of the concepts.\n'
                          )
                        }
                        className="text-left text-xs text-blue-300 hover:text-blue-300 w-full"
                      >
                        • Praise good performance
                      </button>
                    </div>
                  </div>

                  {/* Send Button */}
                  <button
                    onClick={handleSubmitFeedback}
                    disabled={submitting || !feedbackText.trim()}
                    className="w-full px-6 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                  >
                    <Send size={20} />
                    {submitting ? 'Sending...' : 'Send Feedback'}
                  </button>
                </div>

                {/* Feedback History */}
                {feedbackHistory.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-bold text-slate-100 mb-4">Previous Feedback</h3>
                    <div className="space-y-4">
                      {feedbackHistory.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-4 bg-slate-800 rounded-lg border-l-4 border-blue-500"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium text-slate-100">{item.date}</p>
                            {item.score && (
                              <span className="px-2 py-1 bg-blue-500/15 text-blue-300 rounded text-xs font-bold">
                                {item.score}%
                              </span>
                            )}
                          </div>
                          <p className="text-slate-300 text-sm">{item.feedback}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-12 text-center col-span-2">
                <MessageSquare size={48} className="mx-auto text-slate-500 mb-4" />
                <p className="text-slate-500 text-lg">Select a student to provide feedback</p>
              </div>
            )}
          </div>
        </div>

        {/* Best Practices */}
        <div className="mt-8 bg-cyan-50 rounded-lg p-6 border border-cyan-200">
          <h3 className="font-semibold text-cyan-900 mb-3">💬 Effective Feedback Tips</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-sm text-cyan-800">
              <p className="font-medium mb-1">✓ Be Specific</p>
              <p>Reference specific assignments or concepts</p>
            </div>
            <div className="text-sm text-cyan-800">
              <p className="font-medium mb-1">✓ Be Constructive</p>
              <p>Focus on improvement rather than criticism</p>
            </div>
            <div className="text-sm text-cyan-800">
              <p className="font-medium mb-1">✓ Be Timely</p>
              <p>Provide feedback as soon as possible after assessment</p>
            </div>
            <div className="text-sm text-cyan-800">
              <p className="font-medium mb-1">✓ Be Encouraging</p>
              <p>Balance criticism with praise for effort</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
