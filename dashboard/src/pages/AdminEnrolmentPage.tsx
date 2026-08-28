import { useState, useEffect } from 'react';
import { Printer, AlertCircle, AlertTriangle, Download } from 'lucide-react';
import { adminReportsV2API } from '../api/admin';
import { exportExcel, exportCSV } from '../utils/exportUtils';
import {
  ReportActionButton,
  ReportMetricCard,
  ReportNotice,
  ReportPage,
  ReportPrintStyles,
  ReportSectionTitle,
  ReportSurface,
  ReportToolbar,
} from '../components/reports/PremiumReportLayout';

interface CourseRow {
  course_id: string; course_name: string; cbet_level: string;
  enrolled: number; attendance_pct: number | null; below_threshold: boolean;
}
interface EnrolmentReport {
  school: { name: string; location: string };
  term: { id: string | null; name: string | null };
  summary: { total_enrolled: number; total_courses: number; overall_attendance_pct: number | null; flagged_courses: number };
  by_course: CourseRow[];
  flagged: CourseRow[];
  /** Whose cohorts these numbers cover — one trainer's, one department's, one college's, or all. */
  scope?: { mode: 'all' | 'institution' | 'department' | 'trainer'; label: string };
  generated_at: string;
  generated_by: string;
}

export default function AdminEnrolmentPage() {
  const [data, setData] = useState<EnrolmentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await adminReportsV2API.getEnrolmentOverview() as EnrolmentReport;
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleExcelExport = () => {
    if (!data) return;
    exportExcel(
      [{ name: 'Enrolment & Attendance', rows: data.by_course as unknown as Record<string, unknown>[] }],
      `enrolment-${data.term.name ?? 'all'}`,
      { generatedBy: data.generated_by, reportTitle: 'Enrolment & Attendance Overview' }
    );
  };

  const handleCSVExport = () => {
    if (!data) return;
    exportCSV(data.by_course as unknown as Record<string, unknown>[], `enrolment-${data.term.name ?? 'all'}`);
  };

  if (loading) return (
    <ReportPage>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-cyan-400" />
      </div>
    </ReportPage>
  );

  if (error) return (
    <ReportPage>
      <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center">
        <ReportNotice icon={AlertCircle} tone="error">{error}</ReportNotice>
      </div>
    </ReportPage>
  );

  if (!data) return null;

  return (
    <ReportPage>
      <ReportToolbar
        maxWidth="max-w-5xl"
        title="Enrolment & Attendance Overview"
        description="Monitor course population, attendance health, and flagged cohorts in one export-ready report."
        eyebrow="Admin Reports"
      >
        <ReportActionButton onClick={() => window.print()} icon={Printer}>
          Print
        </ReportActionButton>
        <ReportActionButton onClick={handleExcelExport} icon={Download} variant="success">
          Excel
        </ReportActionButton>
        <ReportActionButton onClick={handleCSVExport} icon={Download} variant="primary">
          CSV
        </ReportActionButton>
      </ReportToolbar>

      <ReportSurface maxWidth="max-w-5xl">
        <div className="border-b border-white/10 pb-6 text-center">
          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70 print:block">Confidential</p>
          <h1 className="mt-3 text-2xl font-semibold uppercase tracking-[0.16em] text-white sm:text-3xl">{data.school.name}</h1>
          <p className="mt-2 text-sm text-slate-400">{data.school.location}</p>
          <h2 className="mt-4 text-lg font-semibold uppercase tracking-[0.18em] text-slate-100">Enrolment & Attendance Overview</h2>
          {data.term.name ? <p className="mt-2 text-sm text-slate-400">{data.term.name}</p> : null}
          {data.scope && data.scope.mode !== 'all' ? (
            <p className="mt-3 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
              {data.scope.label}
            </p>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ReportMetricCard label="Total Enrolled" value={data.summary.total_enrolled} accent="cyan" />
          <ReportMetricCard label="Total Courses" value={data.summary.total_courses} accent="slate" />
          <ReportMetricCard
            label="Overall Attendance"
            value={data.summary.overall_attendance_pct != null ? `${data.summary.overall_attendance_pct}%` : '—'}
            accent={(data.summary.overall_attendance_pct ?? 100) < 75 ? 'rose' : 'emerald'}
          />
          <ReportMetricCard
            label="Flagged Courses"
            value={data.summary.flagged_courses}
            accent={data.summary.flagged_courses > 0 ? 'amber' : 'emerald'}
          />
        </div>

        {data.flagged.length > 0 ? (
          <div className="mt-6">
            <ReportNotice icon={AlertTriangle} tone="warning">
              <div className="space-y-3">
                <div className="font-semibold">
                  {data.flagged.length} course{data.flagged.length > 1 ? 's' : ''} below the 75% attendance threshold
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.flagged.map(c => (
                    <span key={c.course_id} className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-100">
                      {c.course_name} - {c.attendance_pct}%
                    </span>
                  ))}
                </div>
              </div>
            </ReportNotice>
          </div>
        ) : null}

        <div className="mt-6">
          <ReportSectionTitle>Course Breakdown</ReportSectionTitle>
          <div className="overflow-x-auto rounded-[28px] border border-white/10">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-800/90 text-white">
                  <th className="px-3 py-3 text-left">Course</th>
                  <th className="px-3 py-3 text-left">Level</th>
                  <th className="px-3 py-3 text-center">Enrolled</th>
                  <th className="px-3 py-3 text-center">Avg Attendance</th>
                  <th className="px-3 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.by_course.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No data available</td></tr>
                ) : data.by_course.map((row, i) => (
                  <tr
                    key={row.course_id}
                    className={`${row.below_threshold ? 'bg-amber-500/10' : i % 2 === 0 ? 'bg-slate-950/40' : 'bg-white/[0.02]'}`}
                  >
                    <td className="px-3 py-3 font-medium text-slate-100">{row.course_name}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">{row.cbet_level}</td>
                    <td className="px-3 py-3 text-center font-semibold text-slate-300">{row.enrolled}</td>
                    <td className="px-3 py-3 text-center">
                      {row.attendance_pct != null ? (
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.attendance_pct >= 75 ? 'bg-emerald-400/10 text-emerald-200' : 'bg-amber-400/10 text-amber-200'}`}>
                          {row.attendance_pct}%
                        </span>
                      ) : <span className="text-xs text-slate-500">No data</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {row.attendance_pct == null
                        ? <span className="text-xs text-slate-500">—</span>
                        : row.below_threshold
                          ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-200"><AlertTriangle size={12} />Low</span>
                          : <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-200">Good</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-6 text-right text-xs text-slate-500">
          Generated by {data.generated_by} on {new Date(data.generated_at).toLocaleString()}
        </p>
      </ReportSurface>

      <ReportPrintStyles />
    </ReportPage>
  );
}
