import { useState, useEffect } from 'react';
import { Printer, AlertCircle, Info, Download } from 'lucide-react';
import { adminReportsV2API } from '../api/admin';
import { useAuth } from '../auth/AuthContext';
import { exportExcel } from '../utils/exportUtils';

interface CourseRow {
  course_id: string; course_name: string; student_count: number;
  total_billed: number; total_paid: number; collection_rate: number;
}
interface FeeReport {
  school: { name: string; location: string };
  term: { id: string | null; name: string | null };
  summary: { total_billed: number; total_collected: number; outstanding: number; collection_rate: number };
  by_course: CourseRow[];
  defaulters: Array<{ student_name: string; course_name: string; amount_due: number; paid: number; balance: number }>;
  note: string | null;
  generated_at: string;
  generated_by: string;
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });

export default function AdminFeeCollectionPage() {
  const { user } = useAuth();
  const [data, setData] = useState<FeeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDefaulters, setShowDefaulters] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await adminReportsV2API.getFeeCollection() as FeeReport;
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
        { name: 'Defaulters', rows: data.defaulters as unknown as Record<string, unknown>[] },
      ],
      `fee-collection-${data.term.name ?? 'all'}`,
      { generatedBy: data.generated_by, reportTitle: 'Fee Collection Report' }
    );
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
        <h1 className="text-xl font-bold text-slate-100 flex-1">Fee Collection Report</h1>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition font-medium">
          <Printer size={16} /> Print
        </button>
        <button onClick={handleExcelExport} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">
          <Download size={16} /> Excel
        </button>
      </div>

      <div className="max-w-5xl mx-auto bg-slate-900 shadow-lg print:shadow-none" style={{ padding: '16mm' }}>
        {/* Header */}
        <div className="text-center border-b-2 border-slate-700 pb-4 mb-6">
          <p className="text-xs text-slate-500 uppercase tracking-widest print:block hidden">CONFIDENTIAL</p>
          <h1 className="text-2xl font-bold text-slate-100 uppercase">{data.school.name}</h1>
          <p className="text-sm text-slate-400">{data.school.location}</p>
          <h2 className="text-lg font-bold text-slate-200 mt-2 uppercase">Fee Collection Report</h2>
          {data.term.name && <p className="text-sm text-slate-400">{data.term.name}</p>}
        </div>

        {/* Note banner */}
        {data.note && (
          <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded flex items-center gap-2 text-blue-700 text-sm">
            <Info size={16} />{data.note}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-5 bg-slate-800 border border-slate-700 rounded-lg text-center">
            <p className="text-xs text-slate-500 uppercase mb-1">Total Billed</p>
            <p className="text-2xl font-bold text-slate-100">{fmt(data.summary.total_billed)}</p>
          </div>
          <div className="p-5 bg-green-50 border border-green-200 rounded-lg text-center">
            <p className="text-xs text-green-600 uppercase mb-1">Collected</p>
            <p className="text-2xl font-bold text-green-700">{fmt(data.summary.total_collected)}</p>
            <p className="text-xs text-green-600 mt-1">{data.summary.collection_rate}%</p>
          </div>
          <div className={`p-5 rounded-lg text-center border ${data.summary.outstanding > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-800 border-slate-700'}`}>
            <p className={`text-xs uppercase mb-1 ${data.summary.outstanding > 0 ? 'text-red-600' : 'text-slate-500'}`}>Outstanding</p>
            <p className={`text-2xl font-bold ${data.summary.outstanding > 0 ? 'text-red-700' : 'text-slate-100'}`}>{fmt(data.summary.outstanding)}</p>
            {data.summary.total_billed > 0 && (
              <p className="text-xs text-red-600 mt-1">{(100 - data.summary.collection_rate).toFixed(1)}%</p>
            )}
          </div>
        </div>

        {/* Collection Rate per Course */}
        <h3 className="font-bold text-slate-200 mb-3 uppercase text-sm">Collection Rate by Course</h3>
        <div className="mb-8 space-y-2">
          {data.by_course.length === 0 ? (
            <p className="text-slate-500 text-sm">No course data available.</p>
          ) : data.by_course.map(row => (
            <div key={row.course_id} className="flex items-center gap-3">
              <span className="text-sm text-slate-300 w-48 truncate">{row.course_name}</span>
              <span className="text-xs text-slate-500 w-16 text-right">{row.student_count} students</span>
              <div className="flex-1 bg-slate-700 rounded-full h-4 relative">
                <div
                  className={`h-4 rounded-full ${row.collection_rate >= 80 ? 'bg-green-500' : row.collection_rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${row.collection_rate}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-300 w-12 text-right">{row.collection_rate}%</span>
            </div>
          ))}
        </div>

        {/* Defaulters — collapsible */}
        {data.defaulters.length > 0 && (
          <div>
            <button
              onClick={() => setShowDefaulters(!showDefaulters)}
              className="flex items-center gap-2 font-bold text-slate-200 uppercase text-sm mb-3 print:hidden"
            >
              {showDefaulters ? '▼' : '▶'} Outstanding Balances ({data.defaulters.length} students)
            </button>
            <h3 className="font-bold text-slate-200 uppercase text-sm mb-3 hidden print:block">
              Outstanding Balances — CONFIDENTIAL
            </h3>
            {showDefaulters && (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-3 py-2 text-left">Student</th>
                    <th className="px-3 py-2 text-left">Course</th>
                    <th className="px-3 py-2 text-right">Amount Due</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.defaulters.map((d, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800'}>
                      <td className="px-3 py-2 font-medium text-slate-100">{d.student_name}</td>
                      <td className="px-3 py-2 text-slate-400">{d.course_name}</td>
                      <td className="px-3 py-2 text-right">{fmt(d.amount_due)}</td>
                      <td className="px-3 py-2 text-right text-green-700">{fmt(d.paid)}</td>
                      <td className="px-3 py-2 text-right text-red-700 font-bold">{fmt(d.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

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
