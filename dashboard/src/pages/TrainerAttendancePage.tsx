import { useState, useEffect } from 'react';
import { Printer, AlertCircle, AlertTriangle, Plus } from 'lucide-react';
import { trainerReportCardsAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';

interface DayRecord { date: string; status: string; notes: string | null; }
interface AttSummary { total: number; present: number; absent: number; leave: number; substituted: number; attendance_pct: number; }
interface TrainerAttReport {
  school: { name: string; location: string };
  trainer: { id: string; name: string };
  term: { id: string | null; name: string | null };
  records: DayRecord[];
  summary: AttSummary;
  warnings: string[];
  generated_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  present: 'bg-green-500 text-white',
  absent: 'bg-red-500 text-white',
  leave: 'bg-blue-400 text-white',
  substituted: 'bg-purple-400 text-white',
};

function buildCalendar(records: DayRecord[], yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const byDate: Record<string, string> = {};
  records.forEach(r => { byDate[r.date] = r.status; });
  const cells: Array<{ day: number | null; status: string | null }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, status: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(year, month - 1, d).getDay();
    cells.push({ day: d, status: (dow === 0 || dow === 6) ? 'weekend' : (byDate[key] ?? null) });
  }
  return cells;
}

export default function TrainerAttendancePage() {
  const { user } = useAuth();
  const [data, setData] = useState<TrainerAttReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showLog, setShowLog] = useState(false);
  const [logForm, setLogForm] = useState({ date: new Date().toISOString().slice(0, 10), status: 'present', notes: '' });
  const [saving, setSaving] = useState(false);

  const trainerId = user?.trainer_id;

  const load = async () => {
    if (!trainerId) return;
    try {
      setLoading(true);
      setError(null);
      const result = await trainerReportCardsAPI.getTrainerAttendance(trainerId) as TrainerAttReport;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [trainerId]);

  const logAttendance = async () => {
    if (!trainerId) return;
    try {
      setSaving(true);
      await trainerReportCardsAPI.logTrainerAttendance(trainerId, logForm);
      setShowLog(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log attendance');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
    </div>
  );

  const cells = data ? buildCalendar(data.records, month) : [];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="min-h-screen bg-blue-950 p-6 print:bg-slate-900 print:p-0">
      {/* Toolbar */}
      <div className="max-w-3xl mx-auto mb-4 flex items-center gap-3 print:hidden">
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="px-3 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={() => setShowLog(!showLog)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
          <Plus size={16} /> Log Day
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition font-medium">
          <Printer size={16} /> Print
        </button>
      </div>

      {/* Log Form */}
      {showLog && (
        <div className="max-w-3xl mx-auto mb-4 p-4 bg-slate-900 border border-slate-700 rounded-lg shadow print:hidden">
          <h3 className="font-semibold text-slate-200 mb-3">Log Attendance</h3>
          <div className="grid grid-cols-3 gap-3">
            <input type="date" value={logForm.date} onChange={e => setLogForm({ ...logForm, date: e.target.value })}
              className="px-3 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500" />
            <select value={logForm.status} onChange={e => setLogForm({ ...logForm, status: e.target.value })}
              className="px-3 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="leave">Leave</option>
              <option value="substituted">Substituted</option>
            </select>
            <input placeholder="Notes (optional)" value={logForm.notes} onChange={e => setLogForm({ ...logForm, notes: e.target.value })}
              className="px-3 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={logAttendance} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setShowLog(false)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition">Cancel</button>
          </div>
        </div>
      )}

      {error && (
        <div className="max-w-3xl mx-auto mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300">
          <AlertCircle size={18} />{error}
        </div>
      )}

      {data && (
        <div className="max-w-3xl mx-auto bg-slate-900 shadow-lg print:shadow-none" style={{ padding: '16mm' }}>
          {/* Header */}
          <div className="text-center border-b-2 border-slate-700 pb-4 mb-6">
            <h1 className="text-2xl font-bold text-slate-100 uppercase">{data.school.name}</h1>
            <p className="text-sm text-slate-400">{data.school.location}</p>
            <h2 className="text-lg font-bold text-slate-200 mt-2 uppercase">Staff Attendance Summary</h2>
            {data.term.name && <p className="text-sm text-slate-400">{data.term.name}</p>}
          </div>

          {/* Trainer Info */}
          <div className="flex gap-8 mb-6 p-3 bg-slate-800 border border-slate-700 rounded text-sm">
            <div><span className="text-slate-500">Trainer: </span><strong>{data.trainer.name}</strong></div>
            <div><span className="text-slate-500">Month: </span><strong>{month}</strong></div>
          </div>

          {/* Warnings */}
          {data.warnings.length > 0 && (
            <div className="mb-4 space-y-2">
              {data.warnings.map((w, i) => (
                <div key={i} className="p-3 bg-amber-500/10 border border-amber-500/40 rounded flex items-center gap-2 text-amber-300 text-sm">
                  <AlertTriangle size={16} />{w}
                </div>
              ))}
            </div>
          )}

          {/* Calendar */}
          <div className="mb-6">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {days.map(d => <div key={d} className="text-center text-xs font-semibold text-slate-500 py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) => (
                <div key={i} className={`h-10 flex items-center justify-center rounded text-sm font-medium
                  ${!cell.day ? '' :
                    cell.status === 'weekend' ? 'bg-slate-800 text-slate-500' :
                    cell.status ? STATUS_STYLE[cell.status] ?? 'bg-slate-700 text-slate-400' :
                    'bg-slate-800 text-slate-500 border border-dashed border-slate-700'}`}>
                  {cell.day ?? ''}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 mb-6 text-xs print:hidden">
            {[['present','bg-green-500','Present'],['absent','bg-red-500','Absent'],['leave','bg-blue-400','Leave'],['substituted','bg-purple-400','Substituted']].map(([,cls,label]) => (
              <div key={label} className="flex items-center gap-1">
                <div className={`w-4 h-4 rounded ${cls}`} />
                <span className="text-slate-400">{label}</span>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-5 gap-3 text-center">
            {[
              { label: 'Total', value: data.summary.total, color: 'text-slate-100' },
              { label: 'Present', value: data.summary.present, color: 'text-green-300' },
              { label: 'Absent', value: data.summary.absent, color: 'text-red-300' },
              { label: 'Leave', value: data.summary.leave, color: 'text-blue-300' },
              { label: 'Attendance %', value: `${data.summary.attendance_pct}%`, color: data.summary.attendance_pct < 75 ? 'text-red-300' : 'text-green-300' },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-3 bg-slate-800 border border-slate-700 rounded">
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500 text-right mt-6">
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
