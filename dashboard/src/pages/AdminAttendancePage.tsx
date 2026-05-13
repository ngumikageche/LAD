import { useState, useEffect } from 'react';
import { Users, RefreshCw, AlertCircle, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, MapPin } from 'lucide-react';
import { apiRequest } from '../api/client';

interface SessionRow {
  id: string;
  trainer_name: string | null;
  subject_name: string | null;
  session_code: string;
  status: string;
  started_at: string;
  expires_at: string;
  allowed_radius_meters: number;
  total_checkins: number;
  total_submissions: number;
}

interface AttendanceRecord {
  id: string;
  student_name: string | null;
  registration_number: string | null;
  status: string;
  checked_in_at: string;
  distance_from_trainer: number | null;
}

interface SessionDetail {
  session: { id: string; session_code: string; subject_name: string | null; status: string; started_at: string; expires_at: string; allowed_radius_meters: number };
  records: AttendanceRecord[];
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  ended: 'bg-gray-100 text-gray-600',
};

const RECORD_BADGE: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  failed_gps: 'bg-yellow-100 text-yellow-700',
  failed_duplicate: 'bg-orange-100 text-orange-700',
  failed_not_enrolled: 'bg-red-100 text-red-700',
};

const RECORD_LABEL: Record<string, string> = {
  success: 'Checked In',
  failed_gps: 'GPS Failed',
  failed_duplicate: 'Duplicate',
  failed_not_enrolled: 'Not Enrolled',
};

export default function AdminAttendancePage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, SessionDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<SessionRow[]>('/api/v1/attendance/admin/overview');
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleSession = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (detail[id]) return;
    setDetailLoading(id);
    try {
      const data = await apiRequest<SessionDetail>(`/api/v1/attendance/sessions/${id}/records`);
      setDetail(prev => ({ ...prev, [id]: data }));
    } catch {
      // silent
    } finally {
      setDetailLoading(null);
    }
  };

  const filtered = sessions.filter(s =>
    !search ||
    s.trainer_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.subject_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.session_code.toLowerCase().includes(search.toLowerCase())
  );

  const totalCheckins = sessions.reduce((a, s) => a + s.total_checkins, 0);
  const activeSessions = sessions.filter(s => s.status === 'active').length;

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-200">Attendance Overview</h1>
          <p className="text-sm text-slate-500 mt-1">All QR attendance sessions across all trainers</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300 text-sm">
          <AlertCircle size={16} />{error}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Sessions', value: sessions.length, color: 'text-slate-100' },
          { label: 'Active Now', value: activeSessions, color: 'text-green-400' },
          { label: 'Total Check-ins', value: totalCheckins, color: 'text-blue-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by trainer, subject or session code..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-md px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      />

      {filtered.length === 0 && !error && (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl">
          <Users size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400">No attendance sessions found.</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(s => (
          <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleSession(s.id)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-800/50 transition text-left"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-100 truncate">
                  {s.subject_name ?? 'Unknown Subject'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  <span className="text-slate-400">{s.trainer_name ?? 'Unknown Trainer'}</span>
                  {' · '}Code: <span className="font-mono text-slate-400">{s.session_code}</span>
                  {' · '}
                  {new Date(s.started_at).toLocaleDateString()} {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-4">
                <div className="text-center hidden sm:block">
                  <p className="text-xl font-bold text-green-400">{s.total_checkins}</p>
                  <p className="text-xs text-slate-500">Checked In</p>
                </div>
                <div className="text-center hidden sm:block">
                  <p className="text-xl font-bold text-slate-300">{s.total_submissions}</p>
                  <p className="text-xs text-slate-500">Submissions</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[s.status] ?? 'bg-slate-700 text-slate-300'}`}>
                  {s.status}
                </span>
                {expanded === s.id ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
              </div>
            </button>

            {expanded === s.id && (
              <div className="border-t border-slate-800">
                {detailLoading === s.id ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
                  </div>
                ) : detail[s.id] ? (
                  detail[s.id].records.length === 0 ? (
                    <p className="text-center text-slate-500 py-8 text-sm">No check-ins for this session.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-800">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Reg No</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Time</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Distance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {detail[s.id].records.map(r => (
                            <tr key={r.id} className="hover:bg-slate-800/40">
                              <td className="px-6 py-3 text-slate-200 font-medium">{r.student_name ?? '—'}</td>
                              <td className="px-6 py-3 text-slate-400 font-mono text-xs">{r.registration_number ?? '—'}</td>
                              <td className="px-6 py-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${RECORD_BADGE[r.status] ?? 'bg-slate-700 text-slate-300'}`}>
                                  {r.status === 'success' ? <CheckCircle size={11} /> : <XCircle size={11} />}
                                  {RECORD_LABEL[r.status] ?? r.status}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-slate-400 text-xs">
                                {new Date(r.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </td>
                              <td className="px-6 py-3 text-slate-400 text-xs">
                                {r.distance_from_trainer != null ? <span className="flex items-center gap-1"><MapPin size={11} />{r.distance_from_trainer.toFixed(0)}m</span> : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="px-6 py-3 bg-slate-800/50 flex gap-6 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><CheckCircle size={13} className="text-green-400" />{detail[s.id].records.filter(r => r.status === 'success').length} successful</span>
                        <span className="flex items-center gap-1"><XCircle size={13} className="text-red-400" />{detail[s.id].records.filter(r => r.status !== 'success').length} failed</span>
                        <span className="flex items-center gap-1"><Clock size={13} />Ended {new Date(s.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  )
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
