import { useEffect, useState } from 'react';
import { Printer, Download, AlertCircle } from 'lucide-react';
import { reportsAPI } from '../api/student';
import { useAuth } from '../auth/AuthContext';
import {
  ReportActionButton,
  ReportNotice,
  ReportPage,
  ReportPrintStyles,
  ReportSectionTitle,
  ReportSurface,
  ReportToolbar,
} from '../components/reports/PremiumReportLayout';

interface SubjectRow {
  subject_name: string;
  assessment_name: string | null;
  marks_obtained: number;
  total_marks: number | null;
  percentage: number | null;
  grade: string | null;
  is_passed: boolean | null;
  feedback: string | null;
}

interface ReportCard {
  school: { name: string; location: string; type: string };
  student: { id: string; name: string; registration_number: string; enrollment_year: number; course: string | null };
  term: { id: string | null; name: string | null; start_date: string | null; end_date: string | null };
  subjects: SubjectRow[];
  overall_percentage?: number | null;
  attendance: { total: number; present: number; absent: number; late: number };
  generated_at: string;
}

export default function ReportCardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<ReportCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const studentId = user?.student_id;

  useEffect(() => {
    if (!studentId) return;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await reportsAPI.getReportCard(studentId) as ReportCard;
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report card');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [studentId]);

  const handlePrint = () => window.print();

  if (loading) return (
    <ReportPage>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-cyan-400" />
      </div>
    </ReportPage>
  );

  if (error) return (
    <ReportPage>
      <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center">
        <ReportNotice icon={AlertCircle} tone="error">{error}</ReportNotice>
      </div>
    </ReportPage>
  );

  if (!data) return null;

  const attPct = data.attendance.total > 0
    ? Math.round(data.attendance.present / data.attendance.total * 100)
    : 0;

  return (
    <ReportPage>
      <ReportToolbar
        maxWidth="max-w-3xl"
        title="Student Report Card"
        description="Review subject results, attendance, and signature-ready remarks in a cleaner screen and print layout."
        eyebrow="Student Reports"
      >
        <ReportActionButton onClick={handlePrint} icon={Printer} variant="primary">
          Print
        </ReportActionButton>
        <ReportActionButton onClick={handlePrint} icon={Download}>
          Download PDF
        </ReportActionButton>
      </ReportToolbar>

      <ReportSurface maxWidth="max-w-3xl" style={{ minHeight: '297mm' }}>
        <div className="border-b border-white/10 pb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70">Academic Report</p>
          <h1 className="mt-3 text-2xl font-semibold uppercase tracking-[0.16em] text-white sm:text-3xl">{data.school.name}</h1>
          <p className="mt-2 text-sm text-slate-400">{data.school.location}</p>
          <h2 className="mt-4 text-lg font-semibold uppercase tracking-[0.18em] text-slate-100">Student Report Card</h2>
          {data.term.name ? <p className="mt-2 text-sm text-slate-400">{data.term.name}</p> : null}
        </div>

        <div className="mt-6 grid gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Name</span>
            <p className="mt-2 font-semibold text-slate-100">{data.student.name}</p>
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Reg. No.</span>
            <p className="mt-2 font-semibold text-slate-100">{data.student.registration_number}</p>
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Course</span>
            <p className="mt-2 font-semibold text-slate-100">{data.student.course ?? '—'}</p>
          </div>
        </div>

        <div className="mt-6">
          <ReportSectionTitle>Subject Performance</ReportSectionTitle>
          <div className="overflow-x-auto rounded-[28px] border border-white/10">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-800/90 text-white">
                  <th className="px-3 py-3 text-left">Subject</th>
                  <th className="px-3 py-3 text-left">Assessment</th>
                  <th className="px-3 py-3 text-center">Marks</th>
                  <th className="px-3 py-3 text-center">%</th>
                  <th className="px-3 py-3 text-center">Grade</th>
                  <th className="px-3 py-3 text-center">Result</th>
                </tr>
              </thead>
              <tbody>
                {data.subjects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">No scores recorded for this term</td>
                  </tr>
                ) : data.subjects.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-slate-950/40' : 'bg-white/[0.02]'}>
                    <td className="px-3 py-3 font-medium text-slate-100">{row.subject_name}</td>
                    <td className="px-3 py-3 text-slate-400">{row.assessment_name ?? '—'}</td>
                    <td className="px-3 py-3 text-center text-slate-100">
                      {row.marks_obtained}{row.total_marks ? `/${row.total_marks}` : ''}
                    </td>
                    <td className="px-3 py-3 text-center text-slate-100">{row.percentage != null ? `${row.percentage}%` : '—'}</td>
                    <td className="px-3 py-3 text-center font-semibold text-slate-100">{row.grade ?? '—'}</td>
                    <td className="px-3 py-3 text-center">
                      {row.is_passed === true
                        ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-200">Pass</span>
                        : row.is_passed === false
                          ? <span className="rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-200">Fail</span>
                          : <span className="text-slate-500">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {data.subjects.length > 0 ? (
                <tfoot>
                  <tr className="bg-slate-800/70 font-semibold text-white">
                    <td className="px-3 py-3" colSpan={3}>Overall</td>
                    <td className="px-3 py-3 text-center">
                      {data.overall_percentage != null ? `${data.overall_percentage}%` : '—'}
                    </td>
                    <td className="px-3 py-3" colSpan={2} />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
          <ReportSectionTitle className="mb-4">Attendance Summary</ReportSectionTitle>
          <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">Total Days: <strong className="text-white">{data.attendance.total}</strong></div>
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-3 text-emerald-100">Present: <strong>{data.attendance.present}</strong></div>
            <div className="rounded-2xl border border-red-400/15 bg-red-500/10 px-4 py-3 text-red-100">Absent: <strong>{data.attendance.absent}</strong></div>
            <div className="rounded-2xl border border-amber-400/15 bg-amber-500/10 px-4 py-3 text-amber-100">Late: <strong>{data.attendance.late}</strong></div>
            <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/10 px-4 py-3 text-cyan-100">Attendance: <strong>{attPct}%</strong></div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Class Teacher Remarks</p>
            <div className="h-16 rounded-2xl border border-dashed border-white/15 bg-slate-950/30" />
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Principal Remarks</p>
            <div className="h-16 rounded-2xl border border-dashed border-white/15 bg-slate-950/30" />
          </div>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div>
            <div className="border-b border-white/15 pb-2" />
            <p className="mt-2 text-xs text-slate-500">Class Teacher / Date</p>
          </div>
          <div>
            <div className="border-b border-white/15 pb-2" />
            <p className="mt-2 text-xs text-slate-500">Principal / Date</p>
          </div>
        </div>

        <p className="mt-6 text-right text-xs text-slate-500">
          Generated: {new Date(data.generated_at).toLocaleString()}
        </p>
      </ReportSurface>

      <ReportPrintStyles />
    </ReportPage>
  );
}
