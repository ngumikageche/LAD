import { useState, useEffect } from 'react';
import { Printer, AlertCircle, TrendingUp, Users, Award } from 'lucide-react';
import { trainerReportCardsAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';

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

function exportCSV(data: ClassPerfReport) {
  const rows = [
    ['Rank', 'Name', 'Reg No', 'Marks', 'Grade', 'Status'],
    ...data.students.map(s => [
      s.rank ?? '', s.name, s.registration_number,
      s.marks ?? 'N/A', s.grade ?? 'N/A',
      s.is_passed === true ? 'Pass' : s.is_passed === false ? 'Fail' : 'N/A',
    ]),
  ];
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `class-performance-${data.subject.name}.csv`;
  a.click();
}

export default function ClassPerformancePage() {
  const { user } = useAuth();
  const [subjectId, setSubjectId] = useState('');
  const [data, setData] = useState<ClassPerfReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    D: 'bg-orange-500', F: 'bg-red-500', 'N/A': 'bg-gray-300',
  };

  const maxGradeCount = data ? Math.max(...Object.values(data.grade_distribution), 1) : 1;

  return (
    <div className="min-h-screen bg-gray-100 p-6 print:bg-white print:p-0">
      {/* Toolbar */}
      <div className="max-w-5xl mx-auto mb-4 flex items-center gap-3 print:hidden">
        <input
          type="text"
          placeholder="Subject ID"
          value={subjectId}
          onChange={e => setSubjectId(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 flex-1 max-w-xs"
        />
        <button
          onClick={load}
          disabled={loading || !subjectId.trim()}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load Report'}
        </button>
        {data && (
          <>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition font-medium">
              <Printer size={16} /> Print
            </button>
            <button onClick={() => exportCSV(data)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">
              Export CSV
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="max-w-5xl mx-auto mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle size={18} />{error}
        </div>
      )}

      {!data && !loading && (
        <div className="max-w-5xl mx-auto text-center py-20 text-gray-400">
          Enter a Subject ID above to load the class performance report.
        </div>
      )}

      {data && (
        <div className="max-w-5xl mx-auto bg-white shadow-lg print:shadow-none" style={{ padding: '16mm' }}>
          {/* Header */}
          <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
            <h1 className="text-2xl font-bold text-gray-900 uppercase">{data.school.name}</h1>
            <p className="text-sm text-gray-600">{data.school.location}</p>
            <h2 className="text-lg font-bold text-gray-800 mt-2 uppercase">Class Performance Report</h2>
            <p className="text-sm text-gray-600">
              {data.subject.name}{data.term.name ? ` — ${data.term.name}` : ''}
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { icon: TrendingUp, label: 'Class Average', value: `${data.summary.class_average}%`, color: 'text-blue-600' },
              { icon: Users, label: 'Pass Rate', value: `${data.summary.pass_rate}%`, color: 'text-green-600' },
              { icon: Award, label: 'Top Mark', value: `${data.summary.top_mark}`, color: 'text-purple-600' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="p-4 bg-gray-50 border border-gray-200 rounded text-center">
                <Icon size={20} className={`mx-auto mb-1 ${color}`} />
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Grade Distribution */}
          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm uppercase">Grade Distribution</h3>
            <div className="flex gap-3 items-end h-20">
              {Object.entries(data.grade_distribution).sort().map(([grade, count]) => (
                <div key={grade} className="flex flex-col items-center gap-1 flex-1">
                  <span className="text-xs font-bold text-gray-700">{count}</span>
                  <div
                    className={`w-full rounded-t ${gradeColors[grade] ?? 'bg-gray-400'}`}
                    style={{ height: `${Math.round(count / maxGradeCount * 60)}px`, minHeight: '4px' }}
                  />
                  <span className="text-xs font-semibold text-gray-600">{grade}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Students Table */}
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="px-3 py-2 text-center w-12">Rank</th>
                <th className="px-3 py-2 text-left">Student</th>
                <th className="px-3 py-2 text-left">Reg No</th>
                <th className="px-3 py-2 text-center">Marks</th>
                <th className="px-3 py-2 text-center">Grade</th>
                <th className="px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.students.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No data for this term</td></tr>
              ) : data.students.map((row, i) => (
                <tr
                  key={row.student_id}
                  className={`border-b ${row.is_passed === false ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                >
                  <td className="px-3 py-2 text-center font-bold text-gray-500">{row.rank ?? '—'}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{row.registration_number}</td>
                  <td className="px-3 py-2 text-center font-bold">
                    {row.marks != null ? `${row.marks}${row.total_marks ? `/${row.total_marks}` : ''}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-center font-bold">{row.grade ?? '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {row.is_passed === true
                      ? <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">✓ Pass</span>
                      : row.is_passed === false
                        ? <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-medium">✗ Fail</span>
                        : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex gap-6 text-xs text-gray-500">
            <span>Total: {data.summary.total_students}</span>
            <span className="text-green-700">Pass: {data.summary.pass_count}</span>
            <span className="text-red-700">Fail: {data.summary.fail_count}</span>
          </div>

          <p className="text-xs text-gray-400 text-right mt-4">
            Generated: {new Date(data.generated_at).toLocaleString()}
          </p>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:shadow-none, .print\\:shadow-none * { visibility: visible; }
          .print\\:shadow-none { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
