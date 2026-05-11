import { useState, useEffect } from 'react';
import { Printer, AlertCircle, AlertTriangle, Download } from 'lucide-react';
import { adminReportsV2API } from '../api/admin';
import { useAuth } from '../auth/AuthContext';
import { exportExcel, exportCSV } from '../utils/exportUtils';

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
  generated_at: string;
  generated_by: string;
}

export default function AdminEnrolmentPage() {
  const { user } = useAuth();
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
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500" />
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
        <AlertCircle size={20} />{error}
      </div>
    </div>
  );

  if (!data) return null;

  return (
    <div className="min-h-screen bg-blue-950 p-6 print:bg-slate-900 print:p-0">
      {/* Toolbar */}
      <div className="max-w-5xl mx-auto mb-4 flex items-center gap-3 print:hidden">
        <h1 className="text-xl font-bold text-slate-100 flex-1">Enrolment & Attendance Overview</h1>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition font-medium">
          <Printer size={16} /> Print
        </button>
        <button onClick={handleExcelExport} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">
          <Download size={16} /> Excel
        </button>
        <button onClick={handleCSVExport} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
          <Download size={16} /> CSV
        </button>
      </div>

      <div className="max-w-5xl mx-auto bg-slate-900 shadow-lg print:shadow-none" style={{ padding: '16mm' }}>
        {/* Header */}
        <div className="text-center border-b-2 border-slate-700 pb-4 mb-6">
          <p className="text-xs text-slate-500 uppercase tracking-widest print:block hidden">CONFIDENTIAL</p>
          <h1 className="text-2xl font-bold text-slate-100 uppercase">{data.school.name}</h1>
          <p className="text-sm text-slate-400">{data.school.location}</p>
          <h2 className="text-lg font-bold text-slate-200 mt-2 uppercase">Enrolment & Attendance Overview</h2>
          {data.term.name && <p className="text-sm text-slate-400">{data.term.name}</p>}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Enrolled', value: data.summary.total_enrolled, color: 'text-indigo-600' },
            { label: 'Total Courses', value: data.summary.total_courses, color: 'text-slate-300' },
            { label: 'Overall Attendance', value: data.summary.overall_attendance_pct != null ? `${data.summary.overall_attendance_pct}%` : '—', color: (data.summary.overall_attendance_pct ?? 100) < 75 ? 'text-red-600' : 'text-green-600' },
            { label: 'Flagged Courses', value: data.summary.flagged_courses, color: data.summary.flagged_courses > 0 ? 'text-amber-600' : 'text-green-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-center">
              <p className="text-xs text-slate-500 uppercase mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Flagged Alert Banner */}
        {data.flagged.length > 0 && (
          <div className="mb-6 p-3 bg-amber-50 border border-amber-300 rounded">
            <div className="flex items-center gap-2 text-amber-800 font-semibold mb-2">
              <AlertTriangle size={18} />
              {data.flagged.length} course{data.flagged.length > 1 ? 's' : ''} below 75% attendance threshold
            </div>
            <div className="flex flex-wrap gap-2">
              {data.flagged.map(c => (
                <span key={c.course_id} className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-medium">
                  {c.course_name} — {c.attendance_pct}%
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Main Table */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="px-3 py-2 text-left">Course</th>
              <th className="px-3 py-2 text-left">Level</th>
              <th className="px-3 py-2 text-center">Enrolled</th>
              <th className="px-3 py-2 text-center">Avg Attendance</th>
              <th className="px-3 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.by_course.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No data available</td></tr>
            ) : data.by_course.map((row, i) => (
              <tr
                key={row.course_id}
                className={`border-b ${row.below_threshold ? 'bg-amber-50' : i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800'}`}
              >
                <td className="px-3 py-2 font-medium text-slate-100">{row.course_name}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{row.cbet_level}</td>
                <td className="px-3 py-2 text-center font-semibold text-slate-300">{row.enrolled}</td>
                <td className="px-3 py-2 text-center">
                  {row.attendance_pct != null ? (
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${row.attendance_pct >= 75 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                      {row.attendance_pct}%
                    </span>
                  ) : <span className="text-slate-500 text-xs">No data</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  {row.attendance_pct == null
                    ? <span className="text-slate-500 text-xs">—</span>
                    : row.below_threshold
                      ? <span className="flex items-center justify-center gap-1 text-amber-700 text-xs font-medium"><AlertTriangle size={12} />Low</span>
                      : <span className="text-green-700 text-xs font-medium">✓ Good</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs text-slate-500 text-right mt-6">
          Generated by {data.generated_by} on {new Date(data.generated_at).toLocaleString()}
        </p>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:shadow-none, .print\\:shadow-none * { visibility: visible; }
          .print\\:shadow-none { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
          .hidden { display: block !important; }
        }
      `}</style>
    </div>
  );
}
