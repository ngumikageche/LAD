import { useEffect, useState } from 'react';
import { CheckCircle2, FileQuestion, Send } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type OnlineQuestion = {
  id: string;
  text: string;
  type: 'multiple_choice' | 'short_answer' | 'essay';
  marks: number;
  options: string[];
};

type OnlineExam = {
  id: string;
  title: string;
  description: string | null;
  subject_name: string | null;
  duration_minutes: number | null;
  total_marks: number;
  questions: OnlineQuestion[];
  submission: {
    score: number | null;
    max_score: number;
    status: string;
    submitted_at: string;
  } | null;
};

export default function StudentOnlineExamsPage() {
  const { token } = useAuth();
  const [exams, setExams] = useState<OnlineExam[]>([]);
  const [selectedExam, setSelectedExam] = useState<OnlineExam | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadExams = async () => {
    try {
      setError(null);
      const data = await apiRequest<OnlineExam[]>('/online-exams/student', { token });
      setExams(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load online exams');
    }
  };

  useEffect(() => {
    loadExams();
  }, [token]);

  const openExam = async (examId: string) => {
    try {
      setError(null);
      const exam = await apiRequest<OnlineExam>(`/online-exams/student/${examId}`, { token });
      setSelectedExam(exam);
      setAnswers({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open exam');
    }
  };

  const submitExam = async () => {
    if (!selectedExam) return;
    try {
      setSubmitting(true);
      setError(null);
      await apiRequest(`/online-exams/student/${selectedExam.id}/submit`, {
        method: 'POST',
        token,
        body: { answers },
      });
      setSelectedExam(null);
      await loadExams();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit exam');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="rounded-lg border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 p-5">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-100">
            <FileQuestion className="text-indigo-400" /> Online Exams
          </h1>
        </div>
        <div className="max-h-[75vh] overflow-y-auto">
          {exams.map((exam) => (
            <button
              key={exam.id}
              type="button"
              onClick={() => openExam(exam.id)}
              className={`w-full border-b border-slate-800 p-4 text-left hover:bg-slate-800 ${selectedExam?.id === exam.id ? 'bg-indigo-500/10' : ''}`}
            >
              <p className="font-semibold text-slate-100">{exam.title}</p>
              <p className="mt-1 text-xs text-slate-400">{exam.subject_name ?? 'Subject'} • {exam.total_marks} marks</p>
              {exam.submission && (
                <p className="mt-2 inline-flex items-center gap-1 rounded bg-green-500/10 px-2 py-1 text-xs text-green-300">
                  <CheckCircle2 size={13} /> Submitted
                </p>
              )}
            </button>
          ))}
          {exams.length === 0 && <p className="p-5 text-sm text-slate-500">No online exams are available yet.</p>}
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

        {!selectedExam ? (
          <div className="flex min-h-[360px] items-center justify-center text-slate-500">
            Select an online exam to begin.
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-100">{selectedExam.title}</h2>
              <p className="mt-2 text-sm text-slate-400">
                {selectedExam.subject_name ?? 'Subject'} • {selectedExam.total_marks} marks
                {selectedExam.duration_minutes ? ` • ${selectedExam.duration_minutes} minutes` : ''}
              </p>
              {selectedExam.description && <p className="mt-3 text-slate-300">{selectedExam.description}</p>}
            </div>

            {selectedExam.submission ? (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-green-300">
                {selectedExam.submission.score === null
                  ? 'You already submitted this exam. It is waiting for marking.'
                  : `You already submitted this exam. Score: ${selectedExam.submission.score} / ${selectedExam.submission.max_score}`}
              </div>
            ) : (
              <>
                {selectedExam.questions.map((question, index) => (
                  <div key={question.id} className="rounded-lg border border-slate-800 bg-slate-950 p-5">
                    <p className="font-semibold text-slate-100">{index + 1}. {question.text}</p>
                    <p className="mt-1 text-xs text-slate-500">{question.marks} mark{question.marks === 1 ? '' : 's'}</p>
                    {question.type === 'multiple_choice' ? (
                      <div className="mt-4 space-y-2">
                        {question.options.map((option) => (
                          <label key={option} className="flex items-center gap-3 rounded-lg border border-slate-800 p-3 text-slate-300">
                            <input
                              type="radio"
                              name={question.id}
                              checked={answers[question.id] === option}
                              onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        value={answers[question.id] ?? ''}
                        onChange={(e) => setAnswers((current) => ({ ...current, [question.id]: e.target.value }))}
                        rows={question.type === 'essay' ? 6 : 3}
                        className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100"
                      />
                    )}
                  </div>
                ))}

                <button type="button" onClick={submitExam} disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
                  <Send size={16} /> {submitting ? 'Submitting...' : 'Submit Exam'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
