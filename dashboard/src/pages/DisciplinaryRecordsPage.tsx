import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileText, HeartPulse, Printer, User } from 'lucide-react';
import { apiRequest } from '../api/client';
import { trainerStudentsAPI, trainerSubjectsAPI, type StudentWrittenReport } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';

type StudentOption = {
  id: string;
  name: string;
  email: string;
  student_id: string;
  overall_avg: number;
};

type SubjectOption = {
  id: string;
  label: string;
};

type DisciplineIncident = {
  id: string;
  title: string;
  category: string;
  incident_date: string | null;
  subject_name: string | null;
  recorded_by: string | null;
  notes: string | null;
  action_taken: string | null;
  created_at: string | null;
};

type DisciplineReportResponse = {
  student_id: string;
  student_name: string;
  incidents: DisciplineIncident[];
  actions: Array<{
    report_id: string;
    title: string;
    incident_date: string | null;
    action_taken: string;
    recorded_by: string | null;
    created_at: string | null;
  }>;
  note: string;
  permissions: {
    canPrint: boolean;
    canExport: boolean;
  };
  generated_at: string;
};

const DISCIPLINE_CATEGORIES = [
  'Late Arrival',
  'Absenteeism',
  'Misconduct',
  'Disruption',
  'Dress Code',
  'Academic Integrity',
  'General',
] as const;

function parseBehaviourBody(body: string) {
  const lines = body.split('\n');
  let incidentDate = '';
  let category = '';
  let actionTaken = '';
  const notes: string[] = [];
  let inNotes = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const lower = line.toLowerCase();
    if (lower.startsWith('incident date:')) {
      incidentDate = line.split(':', 2)[1]?.trim() ?? '';
      inNotes = false;
      continue;
    }
    if (lower.startsWith('category:')) {
      category = line.split(':', 2)[1]?.trim() ?? '';
      inNotes = false;
      continue;
    }
    if (lower.startsWith('action taken:')) {
      actionTaken = line.split(':', 2)[1]?.trim() ?? '';
      inNotes = false;
      continue;
    }
    if (lower === 'notes:') {
      inNotes = true;
      continue;
    }
    if (inNotes || (!incidentDate && !category && !actionTaken && line)) {
      notes.push(rawLine.trim());
    }
  }

  return {
    incidentDate,
    category,
    actionTaken,
    notes: notes.join('\n').trim(),
  };
}

function buildBehaviourBody({
  incidentDate,
  category,
  actionTaken,
  notes,
}: {
  incidentDate: string;
  category: string;
  actionTaken: string;
  notes: string;
}) {
  return [
    `Incident Date: ${incidentDate || new Date().toISOString().slice(0, 10)}`,
    `Category: ${category || 'General'}`,
    `Action Taken: ${actionTaken || 'Pending review'}`,
    'Notes:',
    notes.trim(),
  ].join('\n');
}

export default function DisciplinaryRecordsPage() {
  const { user, token } = useAuth();
  const isAdmin = user?.user_type === 'admin';
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [history, setHistory] = useState<StudentWrittenReport[]>([]);
  const [report, setReport] = useState<DisciplineReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<string>('General');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const studentRows = isAdmin
          ? await trainerStudentsAPI.getAllStudentsForReports()
          : await trainerStudentsAPI.getStudentsInSubjects();
        setStudents(Array.isArray(studentRows) ? studentRows : []);

        const subjectRows = isAdmin
          ? await apiRequest<Array<{ id: string; name: string }>>('/subjects', { token })
          : await trainerSubjectsAPI.getAssignedSubjects();
        setSubjects(
          (Array.isArray(subjectRows) ? subjectRows : []).map((subject: any) => ({
            id: subject.id,
            label: subject.subject_name ?? subject.name,
          })),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load disciplinary records');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      load();
    }
  }, [isAdmin, token]);

  const behaviourHistory = useMemo(
    () => history.filter((item) => item.report_type === 'behaviour'),
    [history],
  );

  const loadStudentData = async (student: StudentOption) => {
    try {
      setLoadingStudent(true);
      setError(null);
      setSelectedStudent(student);
      const [reports, disciplineReport] = await Promise.all([
        trainerStudentsAPI.getStudentReports(student.id),
        apiRequest<DisciplineReportResponse>(`/reports/student/${student.id}/discipline`, { token }),
      ]);
      setHistory(Array.isArray(reports) ? reports : []);
      setReport(disciplineReport);
    } catch (err) {
      setHistory([]);
      setReport(null);
      setError(err instanceof Error ? err.message : 'Failed to load student discipline data');
    } finally {
      setLoadingStudent(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setIncidentDate(new Date().toISOString().slice(0, 10));
    setCategory('General');
    setSelectedSubjectId('');
    setActionTaken('');
    setNotes('');
  };

  const handleSave = async () => {
    if (!selectedStudent) {
      setError('Select a student first');
      return;
    }
    if (!title.trim() || !notes.trim()) {
      setError('Incident title and notes are required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await trainerStudentsAPI.createStudentReport(selectedStudent.id, {
        title: title.trim(),
        body: buildBehaviourBody({ incidentDate, category, actionTaken, notes }),
        report_type: 'behaviour',
        subject_id: selectedSubjectId || undefined,
      });
      await loadStudentData(selectedStudent);
      resetForm();
      setSuccess('Disciplinary record added successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save disciplinary record');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    if (!report) return;
    const rows = [
      ['Student', report.student_name],
      ['Generated At', new Date(report.generated_at).toLocaleString()],
      [],
      ['Title', 'Category', 'Incident Date', 'Subject', 'Recorded By', 'Action Taken', 'Notes'],
      ...report.incidents.map((incident) => [
        incident.title,
        incident.category,
        incident.incident_date ?? '',
        incident.subject_name ?? '',
        incident.recorded_by ?? '',
        incident.action_taken ?? '',
        incident.notes ?? '',
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => JSON.stringify(cell ?? '')).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `${(report.student_name || 'disciplinary-record').replace(/\s+/g, '-').toLowerCase()}.csv`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-950 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-100">
            <HeartPulse size={30} className="text-rose-400" />
            Disciplinary Records
          </h1>
          <p className="mt-2 text-slate-400">
            Add behaviour incidents and generate the disciplinary report from those existing entries.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} />
              {error}
            </div>
          </div>
        ) : null}

        {success ? (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-green-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} />
              {success}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
          <aside className="rounded-lg border border-slate-800 bg-slate-900 shadow">
            <div className="border-b border-slate-800 p-5">
              <h2 className="text-lg font-semibold text-slate-100">{isAdmin ? 'Students' : 'My Students'}</h2>
              <p className="mt-1 text-sm text-slate-400">{students.length} available</p>
            </div>
            <div className="max-h-[720px] overflow-y-auto">
              {students.map((student) => (
                <button
                  key={student.id}
                  onClick={() => loadStudentData(student)}
                  className={`w-full border-b border-slate-800 p-4 text-left transition hover:bg-slate-800 ${
                    selectedStudent?.id === student.id ? 'bg-rose-500/10' : ''
                  }`}
                >
                  <p className="font-semibold text-slate-100">{student.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{student.email}</p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-slate-500">{student.student_id}</span>
                    <span className="rounded bg-slate-800 px-2 py-1 text-slate-300">
                      {student.overall_avg.toFixed(1)}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <div className="space-y-6">
            {!selectedStudent ? (
              <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900 p-10 text-center text-slate-400">
                Select a student to manage disciplinary records.
              </div>
            ) : (
              <>
                <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="flex items-center gap-2 text-xl font-bold text-slate-100">
                        <User size={20} className="text-rose-400" />
                        {selectedStudent.name}
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">
                        Add a behaviour incident. The disciplinary report preview below is generated from these entries.
                      </p>
                    </div>
                    {loadingStudent ? <span className="text-sm text-slate-500">Loading…</span> : null}
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-300">Incident Title</label>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Disruptive conduct during lab"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-100 focus:border-rose-500 focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-300">Incident Date</label>
                      <input
                        type="date"
                        value={incidentDate}
                        onChange={(e) => setIncidentDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-100 focus:border-rose-500 focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-300">Category</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-100 focus:border-rose-500 focus:ring-2 focus:ring-rose-500"
                      >
                        {DISCIPLINE_CATEGORIES.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-300">Subject</label>
                      <select
                        value={selectedSubjectId}
                        onChange={(e) => setSelectedSubjectId(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-100 focus:border-rose-500 focus:ring-2 focus:ring-rose-500"
                      >
                        <option value="">General / no subject</option>
                        {subjects.map((subject) => (
                          <option key={subject.id} value={subject.id}>{subject.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-slate-300">Action Taken</label>
                    <input
                      value={actionTaken}
                      onChange={(e) => setActionTaken(e.target.value)}
                      placeholder="e.g. Verbal warning and parent notified"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-100 focus:border-rose-500 focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-slate-300">Incident Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={5}
                      placeholder="Describe the incident and any follow-up context."
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 focus:border-rose-500 focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  <div className="mt-5 flex gap-3">
                    <button
                      onClick={handleSave}
                      disabled={submitting}
                      className="rounded-lg bg-rose-600 px-6 py-2 font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? 'Saving…' : 'Add Record'}
                    </button>
                    <button
                      onClick={resetForm}
                      className="rounded-lg bg-slate-700 px-6 py-2 font-medium text-slate-300 transition hover:bg-slate-600"
                    >
                      Clear
                    </button>
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-slate-100">Existing Behaviour Entries</h3>
                      <span className="text-sm text-slate-500">{behaviourHistory.length} records</span>
                    </div>
                    <div className="space-y-3">
                      {behaviourHistory.length === 0 ? (
                        <p className="text-sm text-slate-500">No behaviour entries recorded yet.</p>
                      ) : behaviourHistory.map((item) => {
                        const parsed = parseBehaviourBody(item.body);
                        return (
                          <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-100">{item.title}</p>
                                <p className="mt-1 text-xs text-slate-400">
                                  {parsed.category || 'General'} · {parsed.incidentDate || 'Unknown date'} · {item.subject_name || 'General'}
                                </p>
                              </div>
                              <span className="text-xs text-slate-500">
                                {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                              </span>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">
                              {parsed.notes || item.body}
                            </p>
                            {parsed.actionTaken ? (
                              <p className="mt-3 text-sm text-rose-300">
                                Action: {parsed.actionTaken}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
                          <FileText size={18} className="text-rose-400" />
                          Disciplinary Report Preview
                        </h3>
                        <p className="mt-1 text-sm text-slate-400">Generated from existing behaviour entries.</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handlePrint}
                          disabled={!report?.permissions.canPrint}
                          className="rounded-lg bg-slate-800 px-3 py-2 text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          onClick={handleExport}
                          disabled={!report?.permissions.canExport}
                          className="rounded-lg bg-slate-800 px-3 py-2 text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    </div>

                    {!report ? (
                      <p className="text-sm text-slate-500">No report data available.</p>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-950/40 p-4 text-sm">
                          <div>
                            <p className="text-slate-500">Student</p>
                            <p className="mt-1 font-medium text-slate-100">{report.student_name}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Generated</p>
                            <p className="mt-1 font-medium text-slate-100">
                              {new Date(report.generated_at).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Incidents</p>
                            <p className="mt-1 font-medium text-slate-100">{report.incidents.length}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Actions Logged</p>
                            <p className="mt-1 font-medium text-slate-100">{report.actions.length}</p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {report.incidents.length === 0 ? (
                            <p className="text-sm text-slate-500">No incidents exist for this student yet.</p>
                          ) : report.incidents.map((incident) => (
                            <div key={incident.id} className="rounded-lg border border-slate-800 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-slate-100">{incident.title}</p>
                                  <p className="mt-1 text-xs text-slate-400">
                                    {incident.category} · {incident.incident_date || 'Unknown date'} · {incident.recorded_by || 'Unknown author'}
                                  </p>
                                </div>
                                {incident.subject_name ? (
                                  <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">
                                    {incident.subject_name}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{incident.notes || 'No notes provided.'}</p>
                              {incident.action_taken ? (
                                <p className="mt-3 text-sm text-rose-300">Action taken: {incident.action_taken}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
