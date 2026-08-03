import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Copy, Plus, Save, Search, Users } from 'lucide-react';
import {
  trainerApi,
  type TrainerAssessment,
  type TrainerStudentOption,
  type TrainerSubject,
} from '../../services/trainerApi';
import { Modal } from '../ui/Modal';

type ScoreFormProps = {
  subjects: TrainerSubject[];
  onCreated: () => Promise<void> | void;
};

const ScoreForm = ({ subjects, onCreated }: ScoreFormProps) => {
  const [studentId, setStudentId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [assessments, setAssessments] = useState<TrainerAssessment[]>([]);
  const [assessmentId, setAssessmentId] = useState('');
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);
  const [showCreateAssessment, setShowCreateAssessment] = useState(false);
  const [newAssessmentName, setNewAssessmentName] = useState('');
  const [newAssessmentType, setNewAssessmentType] = useState('test');
  const [newAssessmentTotal, setNewAssessmentTotal] = useState('100');
  const [newAssessmentPass, setNewAssessmentPass] = useState('50');
  const [creatingAssessment, setCreatingAssessment] = useState(false);
  const [term, setTerm] = useState('');
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [examCopies, setExamCopies] = useState<File[]>([]);
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

  useEffect(() => {
    let cancelled = false;
    const loadAssessments = async () => {
      if (!subjectId) {
        setAssessments([]);
        setAssessmentId('');
        return;
      }
      try {
        setAssessmentsLoading(true);
        const items = await trainerApi.getAssessments(subjectId);
        if (cancelled) return;
        setAssessments(items);
        setAssessmentId((current) => (
          current && items.some((item) => item.id === current)
            ? current
            : items[0]?.id ?? ''
        ));
      } catch (err) {
        if (cancelled) return;
        setAssessments([]);
        setAssessmentId('');
        setError(err instanceof Error ? err.message : 'Failed to load assessments.');
      } finally {
        if (!cancelled) setAssessmentsLoading(false);
      }
    };
    loadAssessments();
    return () => { cancelled = true; };
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
  const selectedAssessment = useMemo(
    () => assessments.find((assessment) => assessment.id === assessmentId) ?? null,
    [assessmentId, assessments],
  );

  const selectStudent = (student: TrainerStudentOption) => {
    setStudentId(student.id);
    setStudentQuery(student.name ?? student.registration_number);
    setIsStudentModalOpen(false);
  };

  const startNewAssessment = (copySelected = false) => {
    if (copySelected && selectedAssessment) {
      setNewAssessmentName(`${selectedAssessment.name} Copy`);
      setNewAssessmentType(selectedAssessment.assessment_type);
      setNewAssessmentTotal(String(selectedAssessment.total_marks));
      setNewAssessmentPass(String(selectedAssessment.pass_marks ?? selectedAssessment.total_marks / 2));
    } else {
      setNewAssessmentName('');
      setNewAssessmentType('test');
      setNewAssessmentTotal('100');
      setNewAssessmentPass('50');
    }
    setShowCreateAssessment(true);
  };

  const handleCreateAssessment = async () => {
    const totalMarks = Number(newAssessmentTotal);
    const passMarks = Number(newAssessmentPass);
    if (!subjectId || !newAssessmentName.trim()) {
      setError('Select a subject and enter an assessment name.');
      return;
    }
    if (!Number.isInteger(totalMarks) || totalMarks <= 0 || !Number.isInteger(passMarks) || passMarks < 0 || passMarks > totalMarks) {
      setError('Enter valid whole numbers for total and pass marks.');
      return;
    }
    try {
      setCreatingAssessment(true);
      setError(null);
      const created = await trainerApi.createAssessment({
        subject_id: subjectId,
        name: newAssessmentName.trim(),
        assessment_type: newAssessmentType,
        total_marks: totalMarks,
        pass_marks: passMarks,
      });
      setAssessments((current) => [...current, created]);
      setAssessmentId(created.id);
      setShowCreateAssessment(false);
      setSuccess(`${created.name} created. It is selected for student marks.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create assessment.');
    } finally {
      setCreatingAssessment(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const numericScore = Number(score);
    if (!studentId.trim() || !subjectId || !assessmentId || !term.trim() || !score.trim() || Number.isNaN(numericScore)) {
      setError('Assessment, student, subject, term, and score are required.');
      return;
    }
    if (selectedAssessment && (numericScore < 0 || numericScore > selectedAssessment.total_marks)) {
      setError(`Score must be between 0 and ${selectedAssessment.total_marks}.`);
      return;
    }
    try {
      setIsSubmitting(true);
      await trainerApi.createScore({
        student_id: studentId.trim(),
        subject_id: subjectId,
        assessment_id: assessmentId,
        term: term.trim(),
        score: numericScore,
        feedback: feedback.trim() || undefined,
        exam_copies: examCopies,
      });

      const currentIndex = students.findIndex((student) => student.id === studentId);
      const nextStudent = currentIndex >= 0 ? students[currentIndex + 1] : students[0];
      setSuccess(
        `${selectedAssessment?.name ?? 'Assessment'} score saved. The assessment remains selected${nextStudent ? ' for the next student' : ''}.`,
      );
      setStudentId(nextStudent?.id ?? '');
      setStudentQuery(nextStudent?.name ?? nextStudent?.registration_number ?? '');
      setScore('');
      setFeedback('');
      setExamCopies([]);
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
        <p className="mt-1 text-sm text-slate-400">Create or select one assessment, then reuse it while recording each learner's marks.</p>
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
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">Subject</span>
          <select
            value={subjectId}
            onChange={(event) => {
              setSubjectId(event.target.value);
              setAssessmentId('');
              setShowCreateAssessment(false);
              setScore('');
            }}
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            placeholder="Term 1"
          />
        </label>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="block text-sm font-semibold text-slate-200">Assessment to reuse</span>
              <span className="mt-1 block text-xs text-slate-400">Every learner saved below will use this assessment record.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startNewAssessment(false)}
                disabled={!subjectId}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus size={14} /> New Assessment
              </button>
              <button
                type="button"
                onClick={() => startNewAssessment(true)}
                disabled={!selectedAssessment}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                <Copy size={14} /> Copy as New
              </button>
            </div>
          </div>

          <select
            value={assessmentId}
            onChange={(event) => setAssessmentId(event.target.value)}
            disabled={!subjectId || assessmentsLoading}
            className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 disabled:opacity-60"
          >
            <option value="">
              {assessmentsLoading ? 'Loading assessments...' : 'Select an assessment'}
            </option>
            {assessments.map((assessment) => (
              <option key={assessment.id} value={assessment.id}>
                {assessment.code ?? '—'} — {assessment.name} ({assessment.total_marks} marks)
              </option>
            ))}
          </select>

          {selectedAssessment ? (
            <p className="mt-2 text-xs text-emerald-300">
              Reusing <span className="font-mono font-semibold">{selectedAssessment.code ?? selectedAssessment.id}</span>
              {' '}for each student · pass mark {selectedAssessment.pass_marks ?? selectedAssessment.total_marks / 2}/{selectedAssessment.total_marks}
            </p>
          ) : !assessmentsLoading && subjectId && assessments.length === 0 ? (
            <p className="mt-2 text-xs text-amber-300">No assessment exists for this subject module. Create one above.</p>
          ) : null}

          {showCreateAssessment ? (
            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-400">
                  Assessment name
                  <input
                    value={newAssessmentName}
                    onChange={(event) => setNewAssessmentName(event.target.value)}
                    placeholder="e.g. CAT 1"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Type
                  <select
                    value={newAssessmentType}
                    onChange={(event) => setNewAssessmentType(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="test">Test</option>
                    <option value="quiz">Quiz</option>
                    <option value="assignment">Assignment</option>
                    <option value="project">Project</option>
                    <option value="practical">Practical</option>
                  </select>
                </label>
                <label className="text-xs text-slate-400">
                  Total marks
                  <input
                    type="number"
                    min="1"
                    value={newAssessmentTotal}
                    onChange={(event) => setNewAssessmentTotal(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Pass marks
                  <input
                    type="number"
                    min="0"
                    value={newAssessmentPass}
                    onChange={(event) => setNewAssessmentPass(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateAssessment}
                  disabled={creatingAssessment}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {creatingAssessment ? 'Creating...' : 'Create and Reuse'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateAssessment(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>

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
          <span className="mb-2 block text-sm font-medium text-slate-300">Score</span>
          <input
            type="number"
            min="0"
            max={selectedAssessment?.total_marks ?? 100}
            step="0.01"
            value={score}
            onChange={(event) => setScore(event.target.value)}
            className="w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            placeholder={selectedAssessment ? `0–${selectedAssessment.total_marks}` : 'Select an assessment first'}
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

        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-slate-300">Physical Exam Copies (optional)</span>
          <input
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.zip,application/pdf,image/png,image/jpeg,application/zip"
            onChange={(event) => setExamCopies(Array.from(event.target.files ?? []))}
            className="w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-700"
          />
          <p className="mt-2 text-xs text-slate-500">
            Optionally attach scanned PDFs, photos, or a ZIP of the original exam scripts.
          </p>
          {examCopies.length > 0 ? (
            <div className="mt-2 space-y-1">
              {examCopies.map((copy) => (
                <p key={`${copy.name}-${copy.size}`} className="text-xs text-slate-400">
                  {copy.name} ({(copy.size / 1024).toFixed(1)} KB)
                </p>
              ))}
            </div>
          ) : null}
        </label>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={18} />
            <span>{isSubmitting ? 'Saving...' : 'Save & Next Student'}</span>
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
