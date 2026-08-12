import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Search, RefreshCw, AlertCircle } from 'lucide-react';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useTableControls } from '../../hooks/useTableControls';
import { TableFooter, SortableTh } from '../ui/TableControls';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProgressRow {
  student_id: string;
  student_name: string;
  registration_number: string;
  course_name: string;
  department_name: string;
  module_name: string;
  subject_name: string;
  avg_score: number;
  total_assessments: number;
  passed: number;
  failed: number;
  pass_rate: number;
  term: string | null;
  trend: 'improving' | 'stable' | 'declining' | null;
  status: 'excellent' | 'good' | 'average' | 'at_risk' | 'critical';
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function deriveStatus(avg: number): ProgressRow['status'] {
  if (avg >= 80) return 'excellent';
  if (avg >= 70) return 'good';
  if (avg >= 60) return 'average';
  if (avg >= 50) return 'at_risk';
  return 'critical';
}

const STATUS_STYLES: Record<ProgressRow['status'], string> = {
  excellent: 'bg-teal-500/15 text-teal-300 border border-teal-500/30',
  good:      'bg-green-500/15 text-green-300 border border-green-500/30',
  average:   'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  at_risk:   'bg-orange-500/15 text-orange-300 border border-orange-500/30',
  critical:  'bg-red-500/15 text-red-300 border border-red-500/30',
};

const STATUS_LABELS: Record<ProgressRow['status'], string> = {
  excellent: 'Excellent',
  good:      'Good',
  average:   'Average',
  at_risk:   'At Risk',
  critical:  'Critical',
};

const BAR_COLORS: Record<ProgressRow['status'], string> = {
  excellent: 'bg-teal-400',
  good:      'bg-green-400',
  average:   'bg-amber-400',
  at_risk:   'bg-orange-400',
  critical:  'bg-red-400',
};

function TrendIcon({ trend }: { trend: ProgressRow['trend'] }) {
  if (trend === 'improving') return <TrendingUp size={14} className="text-green-400" />;
  if (trend === 'declining') return <TrendingDown size={14} className="text-red-400" />;
  return <Minus size={14} className="text-slate-500" />;
}

// ── Trend calculation ──────────────────────────────────────────────────────────

function calculateTrend(scores: any[]): ProgressRow['trend'] {
  if (scores.length < 3) return null; // Need at least 3 scores to determine trend
  
  // Sort by creation date ascending (oldest first)
  const sorted = [...scores].sort((a, b) => {
    const dateA = new Date(a.created_at || a.date || 0).getTime();
    const dateB = new Date(b.created_at || b.date || 0).getTime();
    return dateA - dateB;
  });

  // Split into first half and second half
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  const avgFirst = firstHalf.reduce((sum, s) => sum + (s.score ?? s.marks_obtained ?? 0), 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((sum, s) => sum + (s.score ?? s.marks_obtained ?? 0), 0) / secondHalf.length;

  const diff = avgSecond - avgFirst;
  const changePercent = avgFirst > 0 ? Math.abs(diff / avgFirst) * 100 : 0;

  if (changePercent < 5) return 'stable';
  if (diff > 0) return 'improving';
  return 'declining';
}

// ── Data fetching ──────────────────────────────────────────────────────────────

async function fetchProgress(token: string | null, userId: string, userType: string): Promise<ProgressRow[]> {
  // Only a learner reads their own scores through the student portal. Everyone
  // else — trainer, admin, or any custom staff role — goes to `/scores`, which
  // scopes the rows to the caller server-side. Branching on `=== 'admin'` sent
  // trainers down the student path, where `@student_required` answered
  // "Student access required" no matter what the role was granted.
  // Lower-cased because the caller falls back to `role_name` when `user_type`
  // is absent, and role names are free-text ("Student").
  const isStudent = userType.toLowerCase() === 'student';

  if (!isStudent) {
    const scores = await apiRequest<any[]>('/scores', { token }).catch(() => []);
    const scoreArray: any[] = Array.isArray(scores) ? scores : [];

    // Group scores by student_id
    const byStudent: Record<string, any[]> = {};
    
    for (const s of scoreArray) {
      // Get student_id from enrollment if not directly set
      const sid = s.student_id;
      if (!sid && s.enrollment_id) {
        // Would need to fetch enrollment data, skip for now
        continue;
      }
      if (!sid) continue;
      
      if (!byStudent[sid]) byStudent[sid] = [];
      byStudent[sid].push(s);
    }

    return Object.entries(byStudent).map(([studentId, stScores]) => {
      const avg = stScores.reduce((sum: number, s: any) => sum + (s.marks_obtained ?? 0), 0) / stScores.length;
      const passed = stScores.filter((s: any) => s.is_passed === true || (s.marks_obtained ?? 0) >= 50).length;
      const failed = stScores.length - passed;
      const passRate = stScores.length ? Math.round((passed / stScores.length) * 100) : 0;
      const avgRounded = Math.round(avg * 10) / 10;
      const trend = calculateTrend(stScores);

      return {
        student_id: studentId,
        student_name: stScores[0]?.student_name ?? '—',
        registration_number: stScores[0]?.registration_number ?? '—',
        course_name: stScores[0]?.course_name ?? '—',
        department_name: stScores[0]?.department_name ?? 'Unassigned',
        module_name: stScores[0]?.module_name ?? '—',
        subject_name: stScores[0]?.subject_name ?? '—',
        avg_score: avgRounded,
        total_assessments: stScores.length,
        passed,
        failed,
        pass_rate: passRate,
        term: stScores[0]?.term ?? null,
        trend,
        status: deriveStatus(avgRounded),
      } satisfies ProgressRow;
    });
  }

  // Student: fetch own scores
  const data = await apiRequest<any>('/api/v1/student/scores', { token });
  const items: any[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

  // Group by subject
  const bySubject: Record<string, any[]> = {};
  for (const s of items) {
    const key = s.subject?.id ?? s.subject_id ?? 'unknown';
    if (!bySubject[key]) bySubject[key] = [];
    bySubject[key].push(s);
  }

  return Object.entries(bySubject).map(([, subjectScores]) => {
    const first = subjectScores[0];
    const avg = subjectScores.reduce((sum, s) => sum + (s.score ?? 0), 0) / subjectScores.length;
    const passed = subjectScores.filter((s) => s.is_passed === true || s.score >= 50).length;
    const failed = subjectScores.length - passed;
    const passRate = Math.round((passed / subjectScores.length) * 100);
    const avgRounded = Math.round(avg * 10) / 10;
    const trend = calculateTrend(subjectScores);

    return {
      student_id: userId,
      student_name: 'Me',
      registration_number: '—',
      course_name: first?.subject?.module?.course?.name ?? '—',
      department_name: first?.subject?.module?.course?.department?.name ?? '—',
      module_name: first?.subject?.module?.name ?? '—',
      subject_name: first?.subject?.name ?? '—',
      avg_score: avgRounded,
      total_assessments: subjectScores.length,
      passed,
      failed,
      pass_rate: passRate,
      term: first?.term ?? null,
      trend,
      status: deriveStatus(avgRounded),
    } satisfies ProgressRow;
  });
}

// ── Summary cards ──────────────────────────────────────────────────────────────

function SummaryCards({ rows }: { rows: ProgressRow[] }) {
  if (rows.length === 0) return null;
  const avg = rows.length ? rows.reduce((s, r) => s + r.avg_score, 0) / rows.length : 0;
  const passRate = rows.length ? rows.reduce((s, r) => s + r.pass_rate, 0) / rows.length : 0;
  const atRisk = rows.filter((r) => r.status === 'at_risk' || r.status === 'critical').length;
  const excellent = rows.filter((r) => r.status === 'excellent').length;

  const cards = [
    { label: 'Avg Score', value: `${Math.min(100, Math.max(0, avg)).toFixed(1)}%`, color: 'text-blue-400' },
    { label: 'Avg Pass Rate', value: `${Math.min(100, Math.max(0, passRate)).toFixed(1)}%`, color: 'text-green-400' },
    { label: 'At Risk', value: atRisk, color: 'text-orange-400' },
    { label: 'Excellent', value: excellent, color: 'text-teal-400' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-slate-400 text-sm">{c.label}</p>
          <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const ProgressTable = () => {
  const { user, token } = useAuth();
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [prioritySort, setPrioritySort] = useState('attention');

  // Which columns the table needs, which is a question about the rows rather
  // than about rank: a learner reading their own scores gets one row per
  // subject and no use for a Student column, while everyone else — trainer as
  // much as admin — gets one row per learner and needs to see who each is.
  // Keyed to the same test `fetchProgress` branches on, so the columns always
  // match the shape of the data that arrived.
  const isRosterView = (user?.user_type ?? user?.role_name ?? '').toLowerCase() !== 'student';

  const load = async () => {
    if (!user || !token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProgress(token, user.id, user.user_type ?? user.role_name ?? '');
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load progress data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id, token]);

  const departments = useMemo(
    () => Array.from(new Set(rows.map((row) => row.department_name).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const matches = rows.filter((r) => {
      const matchSearch =
        !q ||
        r.student_name.toLowerCase().includes(q) ||
        r.registration_number.toLowerCase().includes(q) ||
        r.department_name.toLowerCase().includes(q) ||
        r.course_name.toLowerCase().includes(q) ||
        r.subject_name.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchDepartment = departmentFilter === 'all' || r.department_name === departmentFilter;
      return matchSearch && matchStatus && matchDepartment;
    });
    return [...matches].sort((a, b) => {
      if (prioritySort === 'highest') return b.avg_score - a.avg_score;
      if (prioritySort === 'assessments') return b.total_assessments - a.total_assessments;
      if (prioritySort === 'attention') return a.avg_score - b.avg_score || a.student_name.localeCompare(b.student_name);
      return 0;
    });
  }, [rows, search, statusFilter, departmentFilter, prioritySort]);

  const tc = useTableControls(filtered, 15);

  return (
    <div className="space-y-6">
      <SummaryCards rows={rows} />

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="p-5 border-b border-slate-800 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-3 flex-1">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder={isRosterView ? 'Search student, course…' : 'Search subject…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All statuses</option>
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="average">Average</option>
              <option value="at_risk">At Risk</option>
              <option value="critical">Critical</option>
            </select>
            {isRosterView ? (
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All departments</option>
                {departments.map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
            ) : null}
            <select
              value={prioritySort}
              onChange={(e) => setPrioritySort(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="attention">Needs attention first</option>
              <option value="highest">Highest progress first</option>
              <option value="assessments">Most assessments first</option>
              <option value="none">Manual column sorting</option>
            </select>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading progress data…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">No progress records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  {isRosterView && <SortableTh label="Student" sortKey="student_name" sort={tc.sort} onSort={tc.setSort} />}
                  {isRosterView && <SortableTh label="Reg No" sortKey="registration_number" sort={tc.sort} onSort={tc.setSort} />}
                  {isRosterView && <SortableTh label="Department" sortKey="department_name" sort={tc.sort} onSort={tc.setSort} />}
                  <SortableTh label={isRosterView ? 'Course' : 'Subject'} sortKey={isRosterView ? 'course_name' : 'subject_name'} sort={tc.sort} onSort={tc.setSort} />
                  {!isRosterView && <SortableTh label="Module" sortKey="module_name" sort={tc.sort} onSort={tc.setSort} />}
                  <SortableTh label="Avg Score" sortKey="avg_score" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Pass Rate" sortKey="pass_rate" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Assessments" sortKey="total_assessments" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Trend" sortKey="trend" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Status" sortKey="status" sort={tc.sort} onSort={tc.setSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tc.paged.map((row, i) => (
                  <tr key={`${row.student_id}-${row.subject_name}-${i}`} className="hover:bg-slate-800/60 transition-colors">
                    {isRosterView && (
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-slate-100">{row.student_name}</p>
                      </td>
                    )}
                    {isRosterView && (
                      <td className="px-6 py-4 text-sm text-slate-400">{row.registration_number}</td>
                    )}
                    {isRosterView && (
                      <td className="px-6 py-4 text-sm text-slate-400">{row.department_name}</td>
                    )}
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {isRosterView ? row.course_name : row.subject_name}
                    </td>
                    {!isRosterView && (
                      <td className="px-6 py-4 text-sm text-slate-400">{row.module_name}</td>
                    )}
                    {/* Avg Score with progress bar */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 min-w-[120px]">
                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${BAR_COLORS[row.status]}`}
                            style={{ width: `${Math.min(100, Math.max(0, row.avg_score))}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-slate-200 w-12 text-right">
                          {Math.min(100, Math.max(0, row.avg_score)).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    {/* Pass rate */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-400 transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, row.pass_rate))}%` }}
                          />
                        </div>
                        <span className="text-sm text-slate-300 w-10 text-right">{Math.min(100, Math.max(0, row.pass_rate)).toFixed(0)}%</span>
                      </div>
                    </td>
                    {/* Assessments */}
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-300">
                        {row.total_assessments}
                        <span className="text-xs text-slate-500 ml-1">
                          ({row.passed}✓ {row.failed}✗)
                        </span>
                      </div>
                    </td>
                    {/* Trend */}
                    <td className="px-6 py-4">
                      <TrendIcon trend={row.trend} />
                    </td>
                    {/* Status badge */}
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[row.status]}`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <TableFooter
          page={tc.page}
          totalPages={tc.totalPages}
          total={tc.total}
          pageSize={tc.pageSize}
          onPage={tc.setPage}
        />
      </div>
    </div>
  );
};

export default ProgressTable;
