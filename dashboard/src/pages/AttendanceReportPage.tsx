import { useState, useEffect } from 'react';
import { Printer, AlertCircle, AlertTriangle } from 'lucide-react';
import { reportsAPI } from '../api/student';
import { useAuth } from '../auth/AuthContext';

interface AttRecord { date: string; status: string; }
interface AttSummary { total: number; present: number; absent: number; late: number; percentage: number; below_threshold: boolean; }
interface AttReport {
  school: { name: string; location: string };
  student: { id: string; name: string; registration_number: string };
  term: { id: string | null; name: string | null };
  month: string | null;
  records: AttRecord[];
  summary: AttSummary;
  generated_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  present: 'bg-green-500 text-white',
  absent: 'bg-red-500 text-white',
  late: 'bg-amber-400 text-white',
};

function buildCalendar(records: AttRecord[], yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const byDate: Record<string, string> = {};
  records.forEach(r => { byDate[r.date] = r.status; });

  const cells: Array<{ day: number | null; status: string | null }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, status: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(year, month - 1, d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    cells.push({ day: d, status: isWeekend ? 'weekend' : (byDate[key] ?? null) });
  }
  return cells;
}

export default function AttendanceReportPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AttReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const studentId = user?.student_id;

  const load = async (m: string) => {
    if (!studentId) return;
    try {
      setLoading(true);
      setError(null);
      const result = await reportsAPI.getAttendanceReport(studentId, undefined, m) as AttReport;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(month); }, [studentId, month]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
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

  const cells = buildCalendar(data.records, month);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="min-h-screen bg-gray-100 p-6 print:bg-white print:p-0">
      {/* Toolbar */}
      <div className="max-w-3xl mx-auto mb-4 flex items-center gap-4 print:hidden">
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          <Printer size={18} /> Print
        </button>
      </div>

      <div className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none" style={{ padding: '16mm' }}>
        {/* Header */}
        <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 uppercase">{data.school.name}</h1>
          <p className="text-sm text-gray-600">{data.school.location}</p>
          <h2 className="text-lg font-bold text-gray-800 mt-2 uppercase">Attendance Report</h2>
          {data.term.name && <p className="text-sm text-gray-600">{data.term.name}</p>}
        </div>

        {/* Student Info */}
        <div className="flex gap-8 mb-6 p-3 bg-gray-50 border border-gray-200 rounded text-sm">
          <div><span className="text-gray-500">Name: </span><strong>{data.student.name}</strong></div>
          <div><span className="text-gray-500">Reg No: </span><strong>{data.student.registration_number}</strong></div>
          <div><span className="text-gray-500">Month: </span><strong>{month}</strong></div>
        </div>

        {/* Alert */}
        {data.summary.below_threshold && (
          <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded flex items-center gap-2 text-red-700 font-medium">
            <AlertTriangle size={18} />
            Attendance below 75% — immediate attention required
          </div>
        )}

        {/* Calendar Grid */}
        <div className="mb-6">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {days.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, i) => (
              <div
                key={i}
                className={`h-10 flex items-center justify-center rounded text-sm font-medium
                  ${!cell.day ? '' :
                    cell.status === 'weekend' ? 'bg-gray-100 text-gray-400' :
                    cell.status ? STATUS_STYLE[cell.status] ?? 'bg-gray-200 text-gray-600' :
                    'bg-gray-50 text-gray-400 border border-dashed border-gray-300'
                  }`}
              >
                {cell.day ?? ''}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 mb-6 text-xs print:hidden">
          {[['present','bg-green-500','Present'],['absent','bg-red-500','Absent'],['late','bg-amber-400','Late'],['weekend','bg-gray-100 border','Weekend']].map(([,cls,label]) => (
            <div key={label} className="flex items-center gap-1">
              <div className={`w-4 h-4 rounded ${cls}`} />
              <span className="text-gray-600">{label}</span>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-5 gap-3 text-center">
          {[
            { label: 'Total Days', value: data.summary.total, color: 'text-gray-900' },
            { label: 'Present', value: data.summary.present, color: 'text-green-700' },
            { label: 'Absent', value: data.summary.absent, color: 'text-red-700' },
            { label: 'Late', value: data.summary.late, color: 'text-amber-700' },
            { label: 'Attendance %', value: `${data.summary.percentage}%`, color: data.summary.below_threshold ? 'text-red-700' : 'text-green-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-3 bg-gray-50 border border-gray-200 rounded">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 text-right mt-6">
          Generated: {new Date(data.generated_at).toLocaleString()}
        </p>
      </div>

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
