import { useEffect, useState } from 'react';
import { CheckCircle2, FileQuestion, Plus, Save, Send, Trash2 } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type SubjectOption = {
  id: string;
  name: string;
};

type ExamQuestion = {
  id: string;
  text: string;
  type: 'multiple_choice' | 'short_answer' | 'essay';
  marks: number;
  options: string[];
  correct_answer: string;
};

type OnlineExam = {
  id: string;
  title: string;
  description: string | null;
  subject_id: string;
  subject_name: string | null;
  status: 'draft' | 'published';
  duration_minutes: number | null;
  auto_marking: boolean;
  total_marks: number;
  questions: ExamQuestion[];
  published_at: string | null;
  created_at: string | null;
};

const emptyQuestion = (): ExamQuestion => ({
  id: crypto.randomUUID(),
  text: '',
  type: 'multiple_choice',
  marks: 1,
  options: ['', ''],
  correct_answer: '',
});

export default function OnlineExamDesignerPage() {
  const { token, user } = useAuth();
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [existingExams, setExistingExams] = useState<OnlineExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [autoMarking, setAutoMarking] = useState(true);
  const [questions, setQuestions] = useState<ExamQuestion[]>([emptyQuestion()]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const loadExistingExams = async () => {
    try {
      const data = await apiRequest<OnlineExam[]>('/online-exams', { token });
      setExistingExams(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load existing exams');
    }
  };

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        const data = user?.user_type === 'trainer'
          ? await apiRequest<any[]>('/api/v1/trainer/subjects', { token })
          : await apiRequest<any[]>('/subjects', { token });
        const items = Array.isArray(data) ? data : [];
        const mapped = items.map((item) => ({
          id: String(item.id),
          name: item.name ?? item.subject_name ?? 'Unnamed subject',
        }));
        setSubjects(mapped);
        setSubjectId((current) => current || mapped[0]?.id || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load subjects');
      }
    };
    loadSubjects();
    loadExistingExams();
  }, [token, user?.user_type]);

  const resetForm = () => {
    setSelectedExamId(null);
    setTitle('');
    setDescription('');
    setDurationMinutes(60);
    setAutoMarking(true);
    setQuestions([emptyQuestion()]);
    setSubjectId((current) => current || subjects[0]?.id || '');
    setError(null);
  };

  const openExistingExam = (exam: OnlineExam) => {
    setSelectedExamId(exam.id);
    setTitle(exam.title);
    setDescription(exam.description ?? '');
    setSubjectId(exam.subject_id);
    setDurationMinutes(exam.duration_minutes ?? 60);
    setAutoMarking(exam.auto_marking ?? true);
    setQuestions(Array.isArray(exam.questions) && exam.questions.length > 0 ? exam.questions : [emptyQuestion()]);
    setError(null);
  };

  const updateQuestion = (id: string, updates: Partial<ExamQuestion>) => {
    setQuestions((current) => current.map((question) => (
      question.id === id ? { ...question, ...updates } : question
    )));
  };

  const updateOption = (questionId: string, index: number, value: string) => {
    setQuestions((current) => current.map((question) => {
      if (question.id !== questionId) return question;
      const options = [...question.options];
      options[index] = value;
      return { ...question, options };
    }));
  };

  const submit = async (publish: boolean) => {
    setError(null);
    if (!title.trim() || !subjectId || questions.some((question) => !question.text.trim())) {
      setError('Title, subject, and all question text are required.');
      return;
    }

    try {
      setSaveStatus('saving');
      const currentExam = existingExams.find((exam) => exam.id === selectedExamId);
      await apiRequest(selectedExamId ? `/online-exams/${selectedExamId}` : '/online-exams', {
        method: selectedExamId ? 'PUT' : 'POST',
        token,
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          subject_id: subjectId,
          duration_minutes: durationMinutes,
          auto_marking: autoMarking,
          status: publish ? 'published' : (currentExam?.status ?? 'draft'),
          questions: questions.map((question) => ({
            ...question,
            options: question.type === 'multiple_choice'
              ? question.options.map((option) => option.trim()).filter(Boolean)
              : [],
          })),
        },
      });
      setSaveStatus('saved');
      await loadExistingExams();
      if (!selectedExamId) {
        resetForm();
      }
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save online exam');
      setSaveStatus('idle');
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <aside className="rounded-lg border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Existing Exams</h2>
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-200"
          >
            <Plus size={13} /> New
          </button>
        </div>
        <div className="max-h-[78vh] overflow-y-auto">
          {existingExams.map((exam) => (
            <button
              key={exam.id}
              type="button"
              onClick={() => openExistingExam(exam)}
              className={`w-full border-b border-slate-800 p-4 text-left transition hover:bg-slate-800 ${
                selectedExamId === exam.id ? 'bg-indigo-500/10' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-100">{exam.title}</p>
                <span className={`rounded px-2 py-0.5 text-xs capitalize ${
                  exam.status === 'published' ? 'bg-green-500/10 text-green-300' : 'bg-amber-500/10 text-amber-300'
                }`}>
                  {exam.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{exam.subject_name ?? 'Subject'} • {exam.total_marks} marks</p>
            </button>
          ))}
          {existingExams.length === 0 && (
            <p className="p-4 text-sm text-slate-500">No exams created yet.</p>
          )}
        </div>
      </aside>

      <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-100">
            <FileQuestion className="text-indigo-400" />
            {selectedExamId ? 'Edit Online Exam' : 'Online Exam Designer'}
          </h1>
          <p className="mt-2 text-sm text-slate-400">Design question exams and publish them to enrolled students.</p>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
      {saveStatus === 'saved' && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300">
          <CheckCircle2 size={18} /> Exam saved successfully.
        </div>
      )}

      <div className="grid gap-4 rounded-lg border border-slate-800 bg-slate-900 p-6 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">Exam Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">Subject</span>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100">
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">Duration Minutes</span>
          <input type="number" min="1" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100" />
        </label>
        <label className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
          autoMarking ? 'border-green-500/30 bg-green-500/10' : 'border-slate-700 bg-slate-800'
        }`}>
          <input
            type="checkbox"
            checked={autoMarking}
            onChange={(e) => setAutoMarking(e.target.checked)}
            className="mt-1 h-4 w-4 rounded accent-green-500"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-100">Auto marking</span>
            <span className="mt-1 block text-xs text-slate-400">Automatically score multiple-choice questions when students submit.</span>
          </span>
        </label>
        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-slate-300">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100" />
        </label>
      </div>

      <div className="space-y-4">
        {questions.map((question, questionIndex) => (
          <div key={question.id} className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-100">Question {questionIndex + 1}</h2>
              <button
                type="button"
                onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))}
                disabled={questions.length === 1}
                className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 disabled:opacity-40"
              >
                <Trash2 size={15} /> Remove
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_180px_120px]">
              <textarea
                value={question.text}
                onChange={(e) => updateQuestion(question.id, { text: e.target.value })}
                rows={3}
                placeholder="Write the question..."
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100"
              />
              <select value={question.type} onChange={(e) => updateQuestion(question.id, { type: e.target.value as ExamQuestion['type'] })} className="h-12 rounded-lg border border-slate-700 bg-slate-800 px-3 text-slate-100">
                <option value="multiple_choice">Multiple Choice</option>
                <option value="short_answer">Short Answer</option>
                <option value="essay">Essay</option>
              </select>
              <input type="number" min="1" value={question.marks} onChange={(e) => updateQuestion(question.id, { marks: Number(e.target.value) })} className="h-12 rounded-lg border border-slate-700 bg-slate-800 px-3 text-slate-100" />
            </div>

            {question.type === 'multiple_choice' && (
              <div className="mt-4 space-y-3">
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <input value={option} onChange={(e) => updateOption(question.id, optionIndex, e.target.value)} placeholder={`Option ${optionIndex + 1}`} className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-100" />
                    <button type="button" onClick={() => updateQuestion(question.id, { correct_answer: option })} className={`rounded-lg px-3 py-2 text-sm ${question.correct_answer === option ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                      Correct
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => updateQuestion(question.id, { options: [...question.options, ''] })} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300">
                  <Plus size={15} /> Add Option
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setQuestions((current) => [...current, emptyQuestion()])} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-200">
          <Plus size={16} /> Add Question
        </button>
        <button type="button" onClick={() => submit(false)} disabled={saveStatus === 'saving'} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
          <Save size={16} /> Save Draft
        </button>
        <button type="button" onClick={() => submit(true)} disabled={saveStatus === 'saving'} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
          <Send size={16} /> Publish to Students
        </button>
      </div>
      </div>
    </div>
  );
}
