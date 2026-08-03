import { useEffect, useState } from 'react';
import { AlertCircle, Award, BarChart3, Download, FileText, Printer, TrendingUp, Users } from 'lucide-react';
import { trainerReportCardsAPI, trainerSubjectsAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';
import { exportCSV, exportExcel, exportPDF } from '../utils/exportUtils';
import {
  ReportActionButton,
  ReportEmptyState,
  ReportMetricCard,
  ReportNotice,
  ReportPage,
  ReportPrintStyles,
  ReportSectionTitle,
  ReportSurface,
  ReportToolbar,
} from '../components/reports/PremiumReportLayout';

interface StudentRow {
  rank: number | null;
  student_id: string;
  name: string;
  registration_number: string;
  marks: number | null;
  total_marks: number | null;
  grade: string | null;
  is_passed: boolean | null;
  feedback: string | null;
}

interface ClassPerfReport {
  school: { name: string; location: string };
  subject: { id: string; name: string };
  term: { id: string | null; name: string | null };
  students: StudentRow[];
  summary: { total_students: number; scored_count: number; class_average: number; pass_rate: number; top_mark: number; pass_count: number; fail_count: number };
  grade_distribution: Record<string, number>;
  generated_at: string;
}

/** One row shape shared by the CSV, Excel, and PDF exports. */
function exportRows(data: ClassPerfReport): Record<string, unknown>[] {
  return data.students.map(s => ({
    rank: s.rank ?? '',
    name: s.name,
    registration_number: s.registration_number,
    marks: s.marks ?? 'N/A',
    grade: s.grade ?? 'N/A',
    status: s.is_passed === true ? 'Pass' : s.is_passed === false ? 'Fail' : 'N/A',
  }));
}

function exportName(data: ClassPerfReport) {
  return `class-performance-${data.subject.name.replace(/\s+/g, '-')}`;
}

function exportMeta(data: ClassPerfReport, generatedBy: string) {
  return {
    generatedBy,
    reportTitle: `${data.subject.name} — Class Performance`,
    subtitle: `${data.school.name} · ${data.students.length} learner${data.students.length === 1 ? '' : 's'}`,
  };
}

export default function ClassPerformancePage() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<{ id: string; subject_name: string; subject_code: string }[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [data, setData] = useState<ClassPerfReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trainerSubjectsAPI.getAssignedSubjects()
      .then(s => {
        const list = Array.isArray(s) ? s : [];
        setSubjects(list);
        if (list.length > 0) setSubjectId(list[0].id);
      })
      .catch(() => {});
  }, []);

  const load = async () => {
    if (!subjectId.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const result = await trainerReportCardsAPI.getClassPerformance(subjectId) as ClassPerfReport;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const gradeColors: Record<string, string> = {
    A: 'bg-green-500', B: 'bg-blue-500', C: 'bg-yellow-500',
    D: 'bg-orange-500', F: 'bg-red-500', 'N/A': 'bg-slate-600',
  };

  const maxGradeCount = data ? Math.max(...Object.values(data.grade_distribution), 1) : 1;
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);

  return (
    <ReportPage>
      <ReportToolbar
        maxWidth="max-w-5xl"
        title="Class Performance"
        description="Load a subject report with ranking, grade distribution, pass-rate analysis, and export-ready print formatting."
        eyebrow="Trainer Reports"
      >
        <div className="w-full sm:min-w-[300px]">
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Subject
          </label>
          <select
            value={subjectId}
            onChange={e => setSubjectId(e.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40 focus:bg-slate-900"
          >
            <option value="">Select Subject</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.subject_name} ({s.subject_code})</option>
            ))}
          </select>
        </div>
        <ReportActionButton onClick={load} disabled={loading || !subjectId.trim()} variant="primary">
          {loading ? 'Loading…' : 'Load Report'}
        </ReportActionButton>
        {data ? (
          <>
            <ReportActionButton onClick={() => window.print()} icon={Printer}>
              Print
            </ReportActionButton>
            <ReportActionButton
              onClick={() => exportExcel(
                [{ name: 'Class Performance', rows: exportRows(data) }],
                exportName(data),
                exportMeta(data, user?.name ?? 'Unknown'),
              )}
              icon={Download}
              variant="success"
            >
              Excel
            </ReportActionButton>
            <ReportActionButton
              onClick={() => exportPDF(
                [{ name: 'Class Performance', rows: exportRows(data) }],
                exportName(data),
                exportMeta(data, user?.name ?? 'Unknown'),
              )}
              icon={FileText}
              variant="warning"
            >
              PDF
            </ReportActionButton>
            <ReportActionButton
              onClick={() => exportCSV(exportRows(data), exportName(data))}
              icon={Download}
              variant="primary"
            >
              CSV
            </ReportActionButton>
          </>
        ) : null}
      </ReportToolbar>

      {error ? (
        <div className="mx-auto mb-4 max-w-5xl">
          <ReportNotice icon={AlertCircle} tone="error">{error}</ReportNotice>
        </div>
      ) : null}

      {!data && !loading ? (
        <ReportEmptyState
          maxWidth="max-w-5xl"
          icon={BarChart3}
          title={selectedSubject ? `${selectedSubject.subject_name} is ready to load` : 'Select a subject to begin'}
          description={
            selectedSubject
              ? 'Load the report to review class averages, grade spread, student ranking, and pass-fail breakdown in a print-ready layout.'
              : 'Choose a subject above to open the class performance report. The view is optimized for desktop review, tablet reading, and clean printing.'
          }
        />
      ) : null}

      {data ? (
        <ReportSurface maxWidth="max-w-5xl">
          <div className="border-b border-white/10 pb-6 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70">Class Performance Report</p>
            <h1 className="mt-3 text-2xl font-semibold uppercase tracking-[0.18em] text-white sm:text-3xl">{data.school.name}</h1>
            <p className="mt-2 text-sm text-slate-400">{data.school.location}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">{data.subject.name}</span>
              {data.term.name ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">{data.term.name}</span> : null}
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ReportMetricCard
              label="Class Average"
              value={`${data.summary.class_average}%`}
              icon={TrendingUp}
              accent="cyan"
              helper={`${data.summary.scored_count} scored students`}
            />
            <ReportMetricCard
              label="Pass Rate"
              value={`${data.summary.pass_rate}%`}
              icon={Users}
              accent="emerald"
              helper={`${data.summary.pass_count} pass / ${data.summary.fail_count} fail`}
            />
            <ReportMetricCard
              label="Top Mark"
              value={data.summary.top_mark}
              icon={Award}
              accent="violet"
              helper={`${data.summary.total_students} students in class`}
            />
          </div>

          <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <ReportSectionTitle>Grade Distribution</ReportSectionTitle>
            <div className="flex min-h-28 items-end gap-3">
              {Object.entries(data.grade_distribution).sort().map(([grade, count]) => (
                <div key={grade} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-xs font-semibold text-slate-300">{count}</span>
                  <div className="flex h-24 w-full items-end rounded-2xl bg-slate-950/60 p-1">
                    <div
                      className={`w-full rounded-xl ${gradeColors[grade] ?? 'bg-gray-400'}`}
                      style={{ height: `${Math.round((count / maxGradeCount) * 100)}%`, minHeight: '6px' }}
                    />
                  </div>
                  <span className="text-xs font-semibold tracking-[0.16em] text-slate-500">{grade}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <ReportSectionTitle>Student Ranking</ReportSectionTitle>
            <div className="overflow-x-auto rounded-[28px] border border-white/10">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-800/90 text-white">
                    <th className="w-16 px-3 py-3 text-center">Rank</th>
                    <th className="px-3 py-3 text-left">Student</th>
                    <th className="px-3 py-3 text-left">Reg No</th>
                    <th className="px-3 py-3 text-center">Marks</th>
                    <th className="px-3 py-3 text-center">Grade</th>
                    <th className="px-3 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-500">No data for this term</td>
                    </tr>
                  ) : data.students.map((row, i) => (
                    <tr
                      key={row.student_id}
                      className={`border-t border-white/5 ${row.is_passed === false ? 'bg-red-500/10' : i % 2 === 0 ? 'bg-slate-950/40' : 'bg-white/[0.02]'}`}
                    >
                      <td className="px-3 py-3 text-center font-semibold text-slate-500">{row.rank ?? '—'}</td>
                      <td className="px-3 py-3 font-medium text-slate-100">{row.name}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{row.registration_number}</td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-100">
                        {row.marks != null ? `${row.marks}${row.total_marks ? `/${row.total_marks}` : ''}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-200">{row.grade ?? '—'}</td>
                      <td className="px-3 py-3 text-center">
                        {row.is_passed === true
                          ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-200">Pass</span>
                          : row.is_passed === false
                            ? <span className="rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-200">Fail</span>
                            : <span className="text-xs text-slate-500">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            <span>Total: {data.summary.total_students}</span>
            <span className="text-emerald-300">Pass: {data.summary.pass_count}</span>
            <span className="text-red-300">Fail: {data.summary.fail_count}</span>
          </div>

          <p className="mt-5 text-right text-xs text-slate-500">
            Generated: {new Date(data.generated_at).toLocaleString()}
          </p>
        </ReportSurface>
      ) : null}

      <ReportPrintStyles />
    </ReportPage>
  );
}
