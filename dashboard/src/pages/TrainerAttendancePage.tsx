import { useState, useEffect } from 'react';
import {
  Users, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp,
  MapPin, RefreshCw, BarChart3, TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell, Label,
} from 'recharts';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface SessionSummary {
  id: string; subject_name: string | null; session_code: string;
  status: string; started_at: string; expires_at: string;
  allowed_radius_meters: number; total_checkins: number; total_submissions: number;
}
interface AttendanceRecord {
  id: string; student_name: string | null; registration_number: string | null;
  status: string; checked_in_at: string; distance_from_trainer: number | null;
}
interface SessionDetail { records: AttendanceRecord[]; }
interface Analytics {
  summary: { total_sessions: number; total_checkins: number };
  per_session: { label: string; present: number; failed: number; date: string }[];
  daily: { date: string; checkins: number }[];
  status_breakdown: { status: string; count: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  success: '#22c55e', manual: '#6366f1', failed_gps: '#f59e0b',
  failed_duplicate: '#f97316', failed_not_enrolled: '#ef4444',
};
const STATUS_LABEL: Record<string, string> = {
  success: 'QR Check-in', manual: 'Manual', failed_gps: 'GPS Failed',
  failed_duplicate: 'Duplicate', failed_not_enrolled: 'Not Enrolled',
};
const RECORD_BADGE: Record<string, string> = {
  success: 'bg-green-500/15 text-green-300', manual: 'bg-indigo-500/15 text-indigo-300',
  failed_gps: 'bg-amber-500/15 text-amber-300', failed_duplicate: 'bg-orange-500/15 text-orange-300',
  failed_not_enrolled: 'bg-red-500/15 text-red-300',
};
const CHART_TOOLTIP = {
  contentStyle: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' },
  labelStyle: { color: '#94a3b8' },
};

export default function TrainerAttendancePage() {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, SessionDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<'charts' | 'sessions'>('charts');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [s, a] = await Promise.all([
        apiRequest<SessionSummary[]>('/api/v1/attendance/sessions/my', { token }),
        apiRequest<Analytics>('/api/v1/attendance/trainer/analytics', { token }),
      ]);
      setSessions(s); setAnalytics(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleSession = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (detail[id]) return;
    setDetailLoading(id);
    try {
      const d = await apiRequest<SessionDetail>(`/api/v1/attendance/sessions/${id}/records`, { token });
      setDetail(prev => ({ ...prev, [id]: d }));
    } catch {} finally { setDetailLoading(null); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
    </div>
  );

  const summary = analytics?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-200">Learner Attendance Record</h1>
          <p className="text-sm text-slate-500 mt-1">Learner check-ins from every attendance session you have run</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Total Sessions', value: summary?.total_sessions ?? 0, color: 'text-slate-100', bg: 'bg-slate-800' },
          { label: 'Total Check-ins', value: summary?.total_checkins ?? 0, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border border-slate-800 rounded-xl p-4 text-center`}>
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 rounded-lg p-1 w-fit">
        {(['charts', 'sessions'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
              tab === t ? 'bg-slate-900 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t === 'charts'
              ? <span className="flex items-center gap-1.5"><BarChart3 size={14} />Charts</span>
              : <span className="flex items-center gap-1.5"><Users size={14} />Sessions</span>}
          </button>
        ))}
      </div>

      {/* ── CHARTS TAB ── */}
      {tab === 'charts' && analytics && (
        <div className="space-y-6">
          {/* Per-session stacked bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <BarChart3 size={18} className="text-indigo-400" />
              <h2 className="text-base font-semibold text-slate-200">Attendance per Session (Last 20)</h2>
            </div>
            {analytics.per_session.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">No sessions yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={analytics.per_session} margin={{ top: 4, right: 16, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-35} textAnchor="end" interval={0}>
                    <Label value="Session" position="insideBottom" offset={-5} />
                  </XAxis>
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false}>
                    <Label value="Check-ins" angle={-90} position="insideLeft" />
                  </YAxis>
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                  <Bar dataKey="present" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} name="Present" />
                  <Bar dataKey="failed" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} name="Failed" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily trend */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp size={18} className="text-indigo-400" />
                <h2 className="text-base font-semibold text-slate-200">Daily Check-ins (30 Days)</h2>
              </div>
              {analytics.daily.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={analytics.daily} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => v.slice(5)}>
                      <Label value="Date" position="insideBottom" offset={-5} />
                    </XAxis>
                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false}>
                      <Label value="Check-ins" angle={-90} position="insideLeft" />
                    </YAxis>
                    <Tooltip {...CHART_TOOLTIP} />
                    <Line type="monotone" dataKey="checkins" stroke="#6366f1" strokeWidth={2} dot={false} name="Check-ins" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Status pie */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-base font-semibold text-slate-200 mb-5">Check-in Status Breakdown</h2>
              {analytics.status_breakdown.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No data yet.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={180}>
                    <PieChart>
                      <Pie data={analytics.status_breakdown} dataKey="count" nameKey="status"
                        cx="50%" cy="50%" outerRadius={72} innerRadius={38}>
                        {analytics.status_breakdown.map((entry, i) => (
                          <Cell key={i} fill={STATUS_COLORS[entry.status] ?? '#64748b'} />
                        ))}
                      </Pie>
                      <Tooltip {...CHART_TOOLTIP} formatter={(v, n) => [v, STATUS_LABEL[n as string] ?? n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 flex-1">
                    {analytics.status_breakdown.map((s) => (
                      <div key={s.status} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[s.status] ?? '#64748b' }} />
                          <span className="text-slate-400">{STATUS_LABEL[s.status] ?? s.status}</span>
                        </div>
                        <span className="font-semibold text-slate-200">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SESSIONS TAB ── */}
      {tab === 'sessions' && (
        <div className="space-y-3">
          {sessions.length === 0 && (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl">
              <Users size={40} className="mx-auto text-slate-600 mb-3" />
              <p className="text-slate-400">No sessions yet. Start one from Take Attendance.</p>
            </div>
          )}

          {sessions.map(s => (
            <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <button onClick={() => toggleSession(s.id)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-800/50 transition text-left"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-100 truncate">{s.subject_name ?? 'Unknown Subject'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Code: <span className="font-mono text-slate-400">{s.session_code}</span>
                    {' · '}{new Date(s.started_at).toLocaleDateString()} {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <div className="text-center hidden sm:block">
                    <p className="text-xl font-bold text-green-400">{s.total_checkins}</p>
                    <p className="text-xs text-slate-500">Present</p>
                  </div>
                  <div className="text-center hidden sm:block">
                    <p className="text-xl font-bold text-slate-300">{s.total_submissions}</p>
                    <p className="text-xs text-slate-500">Submissions</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    s.status === 'active' ? 'bg-green-500/15 text-green-300' : 'bg-slate-700 text-slate-400'
                  }`}>{s.status}</span>
                  {expanded === s.id ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                </div>
              </button>

              {expanded === s.id && (
                <div className="border-t border-slate-800">
                  {detailLoading === s.id ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
                    </div>
                  ) : detail[s.id] ? (
                    detail[s.id].records.length === 0 ? (
                      <p className="text-center text-slate-500 py-8 text-sm">No check-ins recorded.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-800">
                            <tr>
                              {['Student', 'Reg No', 'Status', 'Time', 'Distance'].map(h => (
                                <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {detail[s.id].records.map(r => (
                              <tr key={r.id} className="hover:bg-slate-800/40">
                                <td className="px-6 py-3 text-slate-200 font-medium">{r.student_name ?? '—'}</td>
                                <td className="px-6 py-3 text-slate-400 font-mono text-xs">{r.registration_number ?? '—'}</td>
                                <td className="px-6 py-3">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${RECORD_BADGE[r.status] ?? 'bg-slate-700 text-slate-300'}`}>
                                    {r.status === 'success' || r.status === 'manual' ? <CheckCircle size={11} /> : <XCircle size={11} />}
                                    {STATUS_LABEL[r.status] ?? r.status}
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-slate-400 text-xs">
                                  {new Date(r.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
                        <div className="px-6 py-3 bg-slate-800/50 flex gap-6 text-xs text-slate-400">
                          <span className="flex items-center gap-1"><CheckCircle size={13} className="text-green-400" />{detail[s.id].records.filter(r => r.status === 'success' || r.status === 'manual').length} present</span>
                          <span className="flex items-center gap-1"><XCircle size={13} className="text-red-400" />{detail[s.id].records.filter(r => r.status !== 'success' && r.status !== 'manual').length} failed</span>
                          <span className="flex items-center gap-1"><MapPin size={13} className="text-amber-400" />{s.allowed_radius_meters}m radius</span>
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
      )}
    </div>
  );
}
