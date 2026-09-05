import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Clock, MapPin } from 'lucide-react';
import { apiRequest } from '../api/client';

interface AttRecord {
  id: string;
  session_code: string | null;
  subject_name: string | null;
  status: string;
  checked_in_at: string;
  distance_from_trainer: number | null;
}

interface AttSummary {
  total: number;
  successful: number;
  failed: number;
  attendance_rate: number;
}

interface AttResponse {
  records: AttRecord[];
  summary: AttSummary;
}

const STATUS_BADGE: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  failed_gps: 'bg-yellow-100 text-yellow-700',
  failed_duplicate: 'bg-orange-100 text-orange-700',
  failed_not_enrolled: 'bg-red-100 text-red-700',
  // Manual roll-call statuses — the endpoint returns both registers.
  present: 'bg-green-100 text-green-700',
  late: 'bg-amber-100 text-amber-700',
  absent: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<string, string> = {
  success: 'Checked In',
  failed_gps: 'GPS Failed',
  failed_duplicate: 'Duplicate',
  failed_not_enrolled: 'Not Enrolled',
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
};

const ATTENDED = new Set(['success', 'present', 'late']);

export default function AttendanceReportPage() {
  const [data, setData] = useState<AttResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<AttResponse>('/api/v1/student/attendance')
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load attendance'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
    </div>
  );

  if (error) return (
    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300 text-sm">
      <AlertCircle size={18} />{error}
    </div>
  );

  if (!data) return null;

  const { records, summary } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-200">My Attendance</h1>
        <p className="text-sm text-slate-500 mt-1">Your QR check-in history across all sessions</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Sessions', value: summary.total, color: 'text-slate-100' },
          { label: 'Checked In', value: summary.successful, color: 'text-green-400' },
          { label: 'Failed', value: summary.failed, color: 'text-red-400' },
          {
            label: 'Attendance Rate',
            value: `${summary.attendance_rate}%`,
            color: summary.attendance_rate < 75 ? 'text-red-400' : 'text-green-400',
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {summary.attendance_rate < 75 && summary.total > 0 && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300 text-sm font-medium">
          <AlertCircle size={18} />
          Your attendance rate is below 75% — please attend more sessions.
        </div>
      )}

      {/* Records table */}
      {records.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl">
          <Clock size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400">No attendance records yet. Check in to a session to get started.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="font-semibold text-slate-200">Check-in History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Subject</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Session Code</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Date & Time</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Distance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-slate-800/40">
                    <td className="px-6 py-3 text-slate-200 font-medium">{r.subject_name ?? '—'}</td>
                    <td className="px-6 py-3 text-slate-400 font-mono text-xs">{r.session_code ?? '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[r.status] ?? 'bg-slate-700 text-slate-300'}`}>
                        {ATTENDED.has(r.status)
                          ? <CheckCircle size={11} />
                          : <XCircle size={11} />}
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-400 text-xs">
                      {new Date(r.checked_in_at).toLocaleDateString()} {new Date(r.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-3 text-slate-400 text-xs">
                      {r.distance_from_trainer != null
                        ? <span className="flex items-center gap-1"><MapPin size={11} />{r.distance_from_trainer.toFixed(0)}m</span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
