import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Save, Search, Users } from 'lucide-react';
import { trainerApi, type TrainerStudentOption, type TrainerSubject } from '../../services/trainerApi';
import { Modal } from '../ui/Modal';

type ScoreFormProps = {
  subjects: TrainerSubject[];
  onCreated: () => Promise<void> | void;
};

const ScoreForm = ({ subjects, onCreated }: ScoreFormProps) => {
  const [studentId, setStudentId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [term, setTerm] = useState('');
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [students, setStudents] = useState<TrainerStudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!subjectId && subjects[0]?.id) {
      setSubjectId(subjects[0].id);
    }
  }, [subjectId, subjects]);

  useEffect(() => {
    const loadStudents = async () => {
      if (!subjectId) {
        setStudents([]);
        setStudentId('');
        return;
      }

      try {
        setStudentsLoading(true);
        const response = await trainerApi.getStudents(subjectId);
        const items = Array.isArray(response.items) ? response.items : [];
        setStudents(items);
        setStudentId((current) => {
          if (current && items.some((item) => item.id === current)) {
            return current;
          }
          return items[0]?.id ?? '';
        });
        setStudentQuery((current) => {
          if (current.trim()) {
            return current;
          }
          const firstStudent = items[0];
          return firstStudent?.name ?? firstStudent?.registration_number ?? '';
        });
      } catch (err) {
        setStudents([]);
        setStudentId('');
        setStudentQuery('');
        setError(err instanceof Error ? err.message : 'Failed to load students for this subject.');
      } finally {
        setStudentsLoading(false);
      }
    };

    loadStudents();
  }, [subjectId]);

  const filteredStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    if (!query) {
      return students;
    }

    return students.filter((student) => {
      const name = (student.name ?? '').toLowerCase();
      const registration = student.registration_number.toLowerCase();
      const email = (student.email ?? '').toLowerCase();
      return name.includes(query) || registration.includes(query) || email.includes(query);
    });
  }, [studentQuery, students]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === studentId) ?? null,
    [studentId, students]
  );

  const selectStudent = (student: TrainerStudentOption) => {
    setStudentId(student.id);
    setStudentQuery(student.name ?? student.registration_number);
    setIsStudentModalOpen(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const numericScore = Number(score);
    if (!studentId.trim() || !subjectId || !term.trim() || Number.isNaN(numericScore)) {
      setError('Student ID, subject, term, and score are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      await trainerApi.createScore({
        student_id: studentId.trim(),
        subject_id: subjectId,
        term: term.trim(),
        score: numericScore,
        feedback: feedback.trim() || undefined,
      });

      setSuccess('Score uploaded successfully.');
      setStudentId(students[0]?.id ?? '');
      setStudentQuery(students[0]?.name ?? students[0]?.registration_number ?? '');
      setTerm('');
      setScore('');
      setFeedback('');
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload score.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-slate-100">Upload Score</h2>
        <p className="mt-1 text-sm text-slate-400">Record one validated score at a time with subject ownership checks.</p>
      </div>

      {error ? (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      {success ? (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      ) : null}

      <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <div className="md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-slate-300">Student</span>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border border-slate-700 p-3 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
              <div className="flex items-center gap-2">
                <Search size={16} className="text-slate-500" />
                <input
                  value={studentQuery}
                  onChange={(event) => setStudentQuery(event.target.value)}
                  className="w-full border-0 p-0 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  placeholder={
                    studentsLoading
                      ? 'Loading students...'
                      : !subjectId
                        ? 'Select a subject first'
                        : 'Type student name, email, or registration number'
                  }
                  disabled={!subjectId || studentsLoading || students.length === 0}
                />
              </div>

              {subjectId && !studentsLoading && filteredStudents.length > 0 ? (
                <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-slate-700">
                  {filteredStudents.slice(0, 6).map((student) => {
                    const isActive = student.id === studentId;
                    return (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => selectStudent(student)}
                        className={`flex w-full items-start justify-between px-4 py-3 text-left transition ${
                          isActive ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-900 hover:bg-slate-800'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-medium">{student.name ?? 'Unnamed Student'}</div>
                          <div className="text-xs text-slate-500">
                            {student.registration_number}
                            {student.email ? ` • ${student.email}` : ''}
                          </div>
                        </div>
                        {isActive ? <span className="text-xs font-semibold text-emerald-700">Selected</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {subjectId && !studentsLoading && students.length > 0 && filteredStudents.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No students match that search.</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setIsStudentModalOpen(true)}
              disabled={!subjectId || studentsLoading || students.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Users size={16} />
              Browse All
            </button>
          </div>

          {selectedStudent ? (
            <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Selected: <span className="font-semibold">{selectedStudent.name ?? 'Unnamed Student'}</span> ({selectedStudent.registration_number})
            </div>
          ) : null}
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">Subject</span>
          <select
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            className="w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">Select a subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">Term</span>
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            className="w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            placeholder="Term 1"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">Score</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={score}
            onChange={(event) => setScore(event.target.value)}
            className="w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            placeholder="76.5"
          />
        </label>

        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-slate-300">Feedback</span>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            placeholder="Optional comments for the learner."
          />
        </label>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={18} />
            <span>{isSubmitting ? 'Saving...' : 'Save Score'}</span>
          </button>
        </div>
      </form>

      <Modal
        isOpen={isStudentModalOpen}
        title="Choose Student"
        description="Search and select from all students enrolled in the selected subject."
        onClose={() => setIsStudentModalOpen(false)}
        size="xl"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-700 px-4 py-3">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-slate-500" />
              <input
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                className="w-full border-0 p-0 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                placeholder="Search by name, registration number, or email"
              />
            </div>
          </div>

          <div className="max-h-[26rem] overflow-y-auto rounded-2xl border border-slate-700">
            {filteredStudents.map((student) => {
              const isActive = student.id === studentId;
              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => selectStudent(student)}
                  className={`flex w-full items-start justify-between border-b border-slate-800 px-4 py-4 text-left transition last:border-b-0 ${
                    isActive ? 'bg-emerald-50' : 'bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{student.name ?? 'Unnamed Student'}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {student.registration_number}
                      {student.email ? ` • ${student.email}` : ''}
                    </div>
                    {student.subjects.length > 0 ? (
                      <div className="mt-2 text-xs text-slate-400">{student.subjects.join(', ')}</div>
                    ) : null}
                  </div>
                  <span className={`text-xs font-semibold ${isActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {isActive ? 'Selected' : 'Choose'}
                  </span>
                </button>
              );
            })}

            {filteredStudents.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No students match that search.</div>
            ) : null}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ScoreForm;
