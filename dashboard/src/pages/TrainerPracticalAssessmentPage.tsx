import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Printer, Save, Send, Sparkles, Trash2, Undo2, User } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { FormField, Input, Select, TextArea } from '../components/ui/Form';
import type { PracticalAssessmentPayload, PracticalAssessmentReport } from '../api/trainer';
import { trainerPracticalAssessmentsAPI, trainerStudentsAPI } from '../api/trainer';

type StudentOption = {
  id: string;
  name: string;
  email: string;
  student_id: string;
  enrollment_status: string;
  overall_avg: number;
};

type FormState = {
  assessment_date: string;
  task_1_description: string;
  task_2_description: string;
  task_3_description: string;
  task_4_description: string;
  task_1_score: string;
  task_2_score: string;
  task_3_score: string;
  task_4_score: string;
  task_1_remark: string;
  task_2_remark: string;
  task_3_remark: string;
  task_4_remark: string;
  status: PracticalAssessmentReport['status'];
};

const DEFAULT_FORM: FormState = {
  assessment_date: '',
  task_1_description: '',
  task_2_description: '',
  task_3_description: '',
  task_4_description: '',
  task_1_score: '',
  task_2_score: '',
  task_3_score: '',
  task_4_score: '',
  task_1_remark: '',
  task_2_remark: '',
  task_3_remark: '',
  task_4_remark: '',
  status: 'draft',
};

const MAX_TASKS = 4;

const toNumber = (value: string) => {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const autoRemark = (score: number | null) => {
  if (score == null) return 'Score not recorded.';
  if (score >= 20) return 'Excellent - task completed to industry standard.';
  if (score >= 15) return 'Good - completed with minor corrections required.';
  if (score >= 10) return 'Fair - significant errors observed; remediation recommended.';
  return 'Unsatisfactory - task not adequately completed.';
};

export default function TrainerPracticalAssessmentPage() {
  const { user } = useAuth();
  const isAdmin = user?.user_type === 'admin';
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [reports, setReports] = useState<PracticalAssessmentReport[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedReportId, setSelectedReportId] = useState('');
  const [visibleTaskCount, setVisibleTaskCount] = useState(1);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? null,
    [selectedStudentId, students],
  );

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId],
  );

  useEffect(() => {
    const loadStudents = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = isAdmin
          ? await trainerStudentsAPI.getAllStudentsForReports()
          : await trainerStudentsAPI.getStudentsInSubjects();
        const items = Array.isArray(data) ? (data as StudentOption[]) : [];
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
  }, [isAdmin]);

  const refreshReports = async (studentId: string, preferredReportId?: string) => {
    if (!studentId) {
      setReports([]);
      setSelectedReportId('');
      setForm({ ...DEFAULT_FORM });
      setVisibleTaskCount(1);
      return;
    }

    try {
      setError(null);
      const data = await trainerPracticalAssessmentsAPI.listPracticalAssessments({
        student_id: studentId,
      });
      const items = Array.isArray(data) ? data : [];
      setReports(items);
      const nextSelected =
        (preferredReportId && items.find((item) => item.id === preferredReportId)) ||
        items[0] ||
        null;
      if (nextSelected) {
        setSelectedReportId(nextSelected.id);
        loadFormFromReport(nextSelected);
      } else {
        setSelectedReportId('');
        setForm({ ...DEFAULT_FORM });
        setVisibleTaskCount(1);
      }
    } catch (err) {
      setReports([]);
      setSelectedReportId('');
      setVisibleTaskCount(1);
      setError(err instanceof Error ? err.message : 'Failed to load practical assessments');
    }
  };

  useEffect(() => {
    refreshReports(selectedStudentId);
  }, [selectedStudentId]);

  useEffect(() => {
    if (selectedReport) {
      loadFormFromReport(selectedReport);
    }
  }, [selectedReport]);

  const loadFormFromReport = (report: PracticalAssessmentReport) => {
    const taskValues = [
      [report.task_1_score, report.task_1_remark],
      [report.task_2_score, report.task_2_remark],
      [report.task_3_score, report.task_3_remark],
      [report.task_4_score, report.task_4_remark],
    ];
    const inferredVisibleTasks = taskValues.reduce((highest, [score, remark], index) => {
      const filled = (score != null && String(score).trim() !== '') || (remark != null && String(remark).trim() !== '');
      return filled ? index + 1 : highest;
    }, 1);
    setForm({
      assessment_date: report.assessment_date ? report.assessment_date.slice(0, 10) : '',
      task_1_description: report.task_1_description ?? '',
      task_2_description: report.task_2_description ?? '',
      task_3_description: report.task_3_description ?? '',
      task_4_description: report.task_4_description ?? '',
      task_1_score: report.task_1_score == null ? '' : String(report.task_1_score),
      task_2_score: report.task_2_score == null ? '' : String(report.task_2_score),
      task_3_score: report.task_3_score == null ? '' : String(report.task_3_score),
      task_4_score: report.task_4_score == null ? '' : String(report.task_4_score),
      task_1_remark: report.task_1_remark ?? '',
      task_2_remark: report.task_2_remark ?? '',
      task_3_remark: report.task_3_remark ?? '',
      task_4_remark: report.task_4_remark ?? '',
      status: report.status,
    });
    setVisibleTaskCount(Math.max(1, Math.min(MAX_TASKS, inferredVisibleTasks || 1)));
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const buildPayload = (statusOverride?: PracticalAssessmentReport['status']): PracticalAssessmentPayload => {
    const payload: PracticalAssessmentPayload = {
      id: selectedReportId || undefined,
      student_id: selectedStudentId,
      trainer_id: user?.trainer_id ?? undefined,
      status: statusOverride ?? form.status,
    };

    if (form.assessment_date.trim()) {
      payload.assessment_date = form.assessment_date.trim();
    }
    if (form.task_1_description.trim()) payload.task_1_description = form.task_1_description.trim();
    if (form.task_2_description.trim()) payload.task_2_description = form.task_2_description.trim();
    if (form.task_3_description.trim()) payload.task_3_description = form.task_3_description.trim();
    if (form.task_4_description.trim()) payload.task_4_description = form.task_4_description.trim();
    if (form.task_1_score.trim()) payload.task_1_score = toNumber(form.task_1_score);
    if (form.task_2_score.trim()) payload.task_2_score = toNumber(form.task_2_score);
    if (form.task_3_score.trim()) payload.task_3_score = toNumber(form.task_3_score);
    if (form.task_4_score.trim()) payload.task_4_score = toNumber(form.task_4_score);
    if (form.task_1_remark.trim()) payload.task_1_remark = form.task_1_remark.trim();
    if (form.task_2_remark.trim()) payload.task_2_remark = form.task_2_remark.trim();
    if (form.task_3_remark.trim()) payload.task_3_remark = form.task_3_remark.trim();
    if (form.task_4_remark.trim()) payload.task_4_remark = form.task_4_remark.trim();

    return payload;
  };

  const persistReport = async (statusOverride?: PracticalAssessmentReport['status']) => {
    if (!selectedStudentId) {
      setError('Select a student first');
      return null;
    }

    try {
      setSaving(true);
      setError(null);
      const saved = await trainerPracticalAssessmentsAPI.savePracticalAssessment(buildPayload(statusOverride));
      setReports((current) => {
        const next = current.filter((item) => item.id !== saved.id);
        return [saved, ...next];
      });
      setSelectedReportId(saved.id);
      loadFormFromReport(saved);
      setSuccess(statusOverride === 'complete' ? 'Assessment saved as complete.' : 'Assessment saved.');
      window.setTimeout(() => setSuccess(null), 2500);
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save assessment');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleRelease = async () => {
    const saved = await persistReport('complete');
    if (!saved) return;

    try {
      setReleasing(true);
      setError(null);
      const released = await trainerPracticalAssessmentsAPI.releasePracticalAssessment(saved.id);
      setReports((current) => current.map((item) => (item.id === released.id ? released : item)));
      loadFormFromReport(released);
      setSuccess('Assessment released to the student portal.');
      window.setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to release assessment');
    } finally {
      setReleasing(false);
    }
  };

  const handleUnsend = async () => {
    if (!selectedReportId) return;
    if (!window.confirm('Unsend this report to return it to draft status?')) return;

    try {
      setMutating(true);
      setError(null);
      const unsent = await trainerPracticalAssessmentsAPI.unsendPracticalAssessment(selectedReportId);
      await refreshReports(selectedStudentId, unsent.id);
      setSuccess('Assessment unsent and returned to draft.');
      window.setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unsend assessment');
    } finally {
      setMutating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedReportId) return;
    if (!window.confirm('Delete this report? This will hide it from the trainer and student views.')) return;

    try {
      setMutating(true);
      setError(null);
      await trainerPracticalAssessmentsAPI.deletePracticalAssessment(selectedReportId);
      await refreshReports(selectedStudentId);
      setSuccess('Assessment deleted.');
      window.setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete assessment');
    } finally {
      setMutating(false);
    }
  };

  const handleAutoRemark = (taskIndex: number) => {
    const scoreKey = `task_${taskIndex + 1}_score` as keyof FormState;
    const remarkKey = `task_${taskIndex + 1}_remark` as keyof FormState;
    const score = toNumber(form[scoreKey]);
    updateField(remarkKey, autoRemark(score) as FormState[typeof remarkKey]);
  };

  const handleAddTask = () => {
    setVisibleTaskCount((current) => Math.min(MAX_TASKS, current + 1));
  };

  const handleRemoveTask = (index: number) => {
    if (index === 0 || index !== visibleTaskCount - 1) return;
    const scoreKey = `task_${index + 1}_score` as keyof FormState;
    const remarkKey = `task_${index + 1}_remark` as keyof FormState;
    updateField(scoreKey, '' as FormState[typeof scoreKey]);
    updateField(remarkKey, '' as FormState[typeof remarkKey]);
    setVisibleTaskCount((current) => Math.max(1, current - 1));
  };

  const selectedSummary = useMemo(() => {
    const scores = [form.task_1_score, form.task_2_score, form.task_3_score, form.task_4_score]
      .map(toNumber)
      .filter((score): score is number => score != null);
    const total = scores.reduce((sum, score) => sum + score, 0);
    return {
      total: scores.length > 0 ? total : null,
      outcome:
        scores.length === 4
          ? total >= 70
            ? 'COMPETENT'
            : total >= 50
              ? 'BORDERLINE'
              : 'NOT YET COMPETENT'
          : 'INCOMPLETE',
    };
  }, [form]);

  const liveTotalScore = useMemo(() => {
    const scores = [form.task_1_score, form.task_2_score, form.task_3_score, form.task_4_score]
      .map(toNumber)
      .filter((score): score is number => score != null);
    if (scores.length !== 4) return null;
    return scores.reduce((sum, score) => sum + score, 0);
  }, [form]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-teal-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-lg shadow-slate-950/30">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-teal-300">TVET CDACC</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-100">
              {isAdmin ? 'All Practical Assessments' : 'Practical Assessment Entry'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              {isAdmin
                ? 'Browse every student in the database, open any practical assessment, and manage report release.'
                : 'Record the four task scores, add assessor remarks, and release the completed report to the student portal.'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Students" value={String(students.length)} />
            <Stat label="Drafts" value={String(reports.filter((report) => report.status === 'draft').length)} />
            <Stat label="Scope" value={isAdmin ? 'Admin / All students' : 'Trainer / Assigned students'} />
          </div>
        </div>

        {error ? (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            <AlertCircle size={18} />
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-green-300">
            <CheckCircle2 size={18} />
            {success}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-slate-950/20">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-4">
            <User size={18} className="text-teal-300" />
            <h2 className="text-lg font-semibold text-slate-100">Assigned Students</h2>
          </div>

          <div className="mt-4 space-y-2">
            {students.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
                No students are assigned to your subjects yet.
              </p>
            ) : (
              students.map((student) => (
                <button
                  key={student.id}
                  onClick={() => {
                    setSelectedStudentId(student.id);
                    setSelectedReportId('');
                    setForm({ ...DEFAULT_FORM });
                    setVisibleTaskCount(1);
                  }}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedStudentId === student.id
                      ? 'border-teal-500/40 bg-teal-500/10'
                      : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-100">{student.name}</p>
                      <p className="text-xs text-slate-500">{student.student_id}</p>
                    </div>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                      {student.overall_avg.toFixed(1)}%
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">Existing Reports</p>
              <span className="text-xs text-slate-500">{reports.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {reports.length === 0 ? (
                <p className="text-sm text-slate-500">No practical assessment reports for this student.</p>
              ) : (
                reports.map((report) => (
                  <button
                    key={report.id}
                    onClick={() => setSelectedReportId(report.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                      selectedReportId === report.id
                        ? 'border-indigo-500/40 bg-indigo-500/10 text-slate-100'
                        : 'border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate">{report.unit_of_competency}</span>
                      <span className="text-xs text-slate-500">{report.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{report.total_score == null ? 'Incomplete' : `${report.total_score.toFixed(1)} / 100`}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg shadow-slate-950/20">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Report Details</h2>
                <p className="text-sm text-slate-500">Fill the four task scores, remarks, and the final status.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => window.print()}>
                  <Printer size={16} />
                  Print
                </Button>
                <Button variant="secondary" onClick={() => setForm({ ...DEFAULT_FORM })}>
                  <Sparkles size={16} />
                  Reset
                </Button>
                <Button isLoading={saving} onClick={() => persistReport('draft')}>
                  <Save size={16} />
                  Save Draft
                </Button>
                {selectedReport?.status === 'released' ? (
                  <Button variant="secondary" isLoading={mutating} onClick={handleUnsend}>
                    <Undo2 size={16} />
                    Unsend
                  </Button>
                ) : null}
                <Button isLoading={releasing} onClick={handleRelease}>
                  <Send size={16} />
                  Release
                </Button>
                <Button variant="secondary" isLoading={mutating} onClick={handleDelete}>
                  <Trash2 size={16} />
                  Delete
                </Button>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-200">Selected Student</p>
                  <span className="text-xs text-slate-500">{selectedReportId ? 'Editing existing report' : 'New report'}</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <MiniStat label="Student" value={selectedStudent?.name ?? 'None'} />
                  <MiniStat label="Total" value={liveTotalScore == null ? 'Incomplete' : `${liveTotalScore.toFixed(1)} / 100`} />
                  <MiniStat label="Outcome" value={selectedSummary.outcome} />
                </div>
              </div>

              <div className="space-y-4">
                <FormField label="Assessment Date">
                  <Input
                    type="date"
                    value={form.assessment_date}
                    onChange={(e) => updateField('assessment_date', e.target.value)}
                  />
                </FormField>
                <FormField label="Report Status">
                  <Select value={form.status} onChange={(e) => updateField('status', e.target.value as FormState['status'])}>
                    <option value="draft">Draft</option>
                    <option value="complete">Complete</option>
                    <option value="released">Released</option>
                  </Select>
                </FormField>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg shadow-slate-950/20">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-teal-300" />
              <h2 className="text-xl font-bold text-slate-100">Task Scores</h2>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-slate-500">Add only the tasks you need for this practical assessment.</p>
              <button
                type="button"
                onClick={handleAddTask}
                disabled={visibleTaskCount >= MAX_TASKS}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles size={16} />
                Add Task
              </button>
            </div>

            <div className="mt-6 space-y-5">
              {Array.from({ length: visibleTaskCount }).map((_, index) => {
                const descriptionKey = `task_${index + 1}_description` as keyof FormState;
                const scoreKey = `task_${index + 1}_score` as keyof FormState;
                const remarkKey = `task_${index + 1}_remark` as keyof FormState;
                return (
                  <div key={index} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/15 text-sm font-bold text-teal-300">
                            {index + 1}
                          </span>
                          <p className="text-sm font-semibold text-slate-100">Task {index + 1}</p>
                        </div>
                        <FormField label="Task description">
                          <TextArea
                            value={form[descriptionKey]}
                            onChange={(e) => updateField(descriptionKey, e.target.value as FormState[typeof descriptionKey])}
                            rows={3}
                            placeholder="Write your own task description here..."
                          />
                        </FormField>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[160px_1fr] lg:min-w-[540px]">
                        <FormField label="Score / 25">
                          <Input
                            type="number"
                            min="0"
                            max="25"
                            step="0.5"
                            value={form[scoreKey]}
                            onChange={(e) => updateField(scoreKey, e.target.value as FormState[typeof scoreKey])}
                          />
                        </FormField>
                        <FormField label="Remark">
                          <div className="space-y-2">
                            <TextArea
                              value={form[remarkKey]}
                              onChange={(e) => updateField(remarkKey, e.target.value as FormState[typeof remarkKey])}
                              rows={3}
                            />
                            <button
                              type="button"
                              onClick={() => handleAutoRemark(index)}
                              className="text-xs font-medium text-teal-300 hover:text-teal-200"
                            >
                              Auto-generate remark from score
                            </button>
                          </div>
                        </FormField>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleRemoveTask(index)}
                        disabled={index === 0 || index !== visibleTaskCount - 1}
                        className="text-xs font-medium text-slate-500 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Remove last task
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}
