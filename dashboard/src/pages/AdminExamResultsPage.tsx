import { useState, useEffect } from 'react';
import { Printer, AlertCircle, TrendingUp, TrendingDown, Download } from 'lucide-react';
import { adminReportsV2API } from '../api/admin';
import { useAuth } from '../auth/AuthContext';
import { exportExcel, exportCSV } from '../utils/exportUtils';

interface CourseRow {
  course_id: string; course_name: string; student_count: number;
  scores_count: number; avg_marks: number; pass_pct: number;
  top_student: string | null; top_mark: number;
}
interface SubjectRow {
  subject_id: string; subject_name: string; entries: number;
  avg_marks: number; pass_pct: number; fail_pct: number;
}
interface Trend { prev_term: string; avg_delta: number; pass_rate_delta: number; }
interface ExamReport {
  school: { name: string; location: string };
  term: { id: string | null; name: string | null };
  summary: { school_avg: number; pass_rate: number; total_scores: number; top_course: string | null };
  trend: Trend | null;
  by_course: CourseRow[];
  by_subject: SubjectRow[];
  generated_at: string;
  generated_by: string;
}

function TrendBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-gray-400 text-xs">—</span>;
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '+' : ''}{delta}%
    </span>
  );
}

export default function AdminExamResultsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<ExamReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await adminReportsV2API.getExamResults() as ExamReport;
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
      [
        { name: 'By Course', rows: data.by_course as unknown as Record<string, unknown>[] },
        { name: 'By Subject', rows: data.by_subject as unknown as Record<string, unknown>[] },
      ],
      `exam-results-${data.term.name ?? 'all'}`,
      { generatedBy: data.generated_by, reportTitle: 'School-Wide Exam Results' }
    );
  };

  const handleCSVExport = () => {
    if (!data) return;
    exportCSV(data.by_course as unknown as Record<string, unknown>[], `exam-results-courses-${data.term.name ?? 'all'}`);
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
    <div className="min-h-screen bg-gray-100 p-6 print:bg-white print:p-0">
      {/* Toolbar */}
      <div className="max-w-6xl mx-auto mb-4 flex items-center gap-3 print:hidden">
        <h1 className="text-xl font-bold text-gray-900 flex-1">School-Wide Exam Results</h1>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition font-medium">
          <Printer size={16} /> Print
        </button>
        <button onClick={handleExcelExport} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">
          <Download size={16} /> Excel
        </button>
        <button onClick={handleCSVExport} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
          <Download size={16} /> CSV
        </button>
      </div>

      <div className="max-w-6xl mx-auto bg-white shadow-lg print:shadow-none" style={{ padding: '16mm' }}>
        {/* Header */}
        <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
          <p className="text-xs text-gray-400 uppercase tracking-widest print:block hidden">CONFIDENTIAL</p>
          <h1 className="text-2xl font-bold text-gray-900 uppercase">{data.school.name}</h1>
          <p className="text-sm text-gray-600">{data.school.location}</p>
          <h2 className="text-lg font-bold text-gray-800 mt-2 uppercase">School-Wide Exam Results</h2>
          {data.term.name && <p className="text-sm text-gray-600">{data.term.name}</p>}
        </div>

        {/* Executive Summary */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'School Average', value: `${data.summary.school_avg}%`, delta: data.trend?.avg_delta, color: 'text-indigo-600' },
            { label: 'Pass Rate', value: `${data.summary.pass_rate}%`, delta: data.trend?.pass_rate_delta, color: 'text-green-600' },
            { label: 'Top Course', value: data.summary.top_course ?? '—', delta: null, color: 'text-purple-600' },
          ].map(({ label, value, delta, color }) => (
            <div key={label} className="p-5 bg-gray-50 border border-gray-200 rounded-lg text-center">
              <p className="text-xs text-gray-500 uppercase mb-1">{label}</p>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
              {delta != null && (
                <div className="mt-1 flex justify-center items-center gap-1">
                  <TrendBadge delta={delta} />
                  {data.trend && <span className="text-xs text-gray-400">vs {data.trend.prev_term}</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* By Course Table */}
        <h3 className="font-bold text-gray-800 mb-3 uppercase text-sm">Performance by Course</h3>
        <div className="overflow-x-auto mb-8">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="px-3 py-2 text-left">Course</th>
                <th className="px-3 py-2 text-center">Students</th>
                <th className="px-3 py-2 text-center">Avg Marks</th>
                <th className="px-3 py-2 text-center">Pass %</th>
                <th className="px-3 py-2 text-left">Top Student</th>
              </tr>
            </thead>
            <tbody>
              {data.by_course.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No data for this term</td></tr>
              ) : data.by_course.map((row, i) => (
                <tr key={row.course_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 font-medium text-gray-900">{row.course_name}</td>
                  <td className="px-3 py-2 text-center text-gray-600">{row.student_count}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${row.avg_marks >= 75 ? 'bg-green-100 text-green-800' : row.avg_marks >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                      {row.avg_marks}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center font-semibold text-green-700">{row.pass_pct}%</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{row.top_student ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* By Subject Table */}
        <h3 className="font-bold text-gray-800 mb-3 uppercase text-sm">Performance by Subject</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="px-3 py-2 text-left">Subject</th>
                <th className="px-3 py-2 text-center">Entries</th>
                <th className="px-3 py-2 text-center">Avg</th>
                <th className="px-3 py-2 text-center">Pass %</th>
                <th className="px-3 py-2 text-center">Fail %</th>
              </tr>
            </thead>
            <tbody>
              {data.by_subject.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No data for this term</td></tr>
              ) : data.by_subject.map((row, i) => (
                <tr key={row.subject_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 font-medium text-gray-900">{row.subject_name}</td>
                  <td className="px-3 py-2 text-center text-gray-600">{row.entries}</td>
                  <td className="px-3 py-2 text-center font-semibold">{row.avg_marks}%</td>
                  <td className="px-3 py-2 text-center text-green-700 font-semibold">{row.pass_pct}%</td>
                  <td className="px-3 py-2 text-center text-red-700 font-semibold">{row.fail_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 text-right mt-6">
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
