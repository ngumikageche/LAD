import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Printer, RefreshCw, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  studentApi,
  type StudentAttendanceRecord,
  type StudentPerformance,
  type StudentScore,
  type StudentSubject,
} from '../services/studentApi';
import { useAuth } from '../auth/AuthContext';
import { exportExcel } from '../utils/exportUtils';
import {
  ReportActionButton,
  ReportMetricCard,
  ReportNotice,
  ReportPage,
  ReportPrintStyles,
  ReportSectionTitle,
  ReportSurface,
  ReportToolbar,
} from '../components/reports/PremiumReportLayout';

/**
 * The learner's performance report: how each assigned subject is going, how the
 * average has moved across terms, and where attendance and marks disagree.
 *
 * Deliberately per subject rather than per learner. The report card states the
 * outcome of a term; this states which subjects produced it and which of them
 * are moving in the wrong direction, which is what a learner deciding where to
 * spend revision time actually needs.
 */

const PASS_MARK = 50;
const STRONG_MARK = 75;

const fmtPct = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}%`;

type SubjectRow = {
  subject: string;
  average: number;
  scoresCount: number;
  attendanceRate: number | null;
  band: 'strong' | 'steady' | 'at risk';
};

const bandFor = (average: number): SubjectRow['band'] =>
  average >= STRONG_MARK ? 'strong' : average >= PASS_MARK ? 'steady' : 'at risk';

const BAND_STYLE: Record<SubjectRow['band'], string> = {
  strong: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  steady: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30',
  'at risk': 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

export default function StudentPerformancePage() {
  const { user } = useAuth();
  const [performance, setPerformance] = useState<StudentPerformance | null>(null);
  const [subjects, setSubjects] = useState<StudentSubject[]>([]);
  const [attendance, setAttendance] = useState<StudentAttendanceRecord[]>([]);
  const [scores, setScores] = useState<StudentScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [performanceRes, subjectsRes, attendanceRes, scoresRes] = await Promise.all([
        studentApi.getPerformance(),
        studentApi.getSubjects(),
        studentApi.getAttendance(),
        studentApi.getScores({ per_page: 100 }),
      ]);
      setPerformance(performanceRes);
      setSubjects(subjectsRes.items);
      setAttendance(attendanceRes.records);
      setScores(scoresRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your performance report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const attendanceBySubject = useMemo(() => {
    const buckets = new Map<string, { total: number; present: number }>();
    attendance.forEach((record) => {
      const name = record.subject_name?.trim();
      if (!name) return;
      const bucket = buckets.get(name) || { total: 0, present: 0 };
      bucket.total += 1;
      if (record.status === 'success') bucket.present += 1;
      buckets.set(name, bucket);
    });
    return buckets;
  }, [attendance]);

  /**
   * Every assigned subject appears, including those with no marks yet. A subject
   * silently missing from a performance report reads as a subject that is fine.
   */
  const rows = useMemo<SubjectRow[]>(() => {
    const marksBySubject = new Map(
      (performance?.subject_performance || []).map((item) => [item.subject_name, item]),
    );
    const names = new Set<string>([
      ...subjects.map((subject) => subject.name),
      ...marksBySubject.keys(),
    ]);

    return Array.from(names)
      .map((name) => {
        const marks = marksBySubject.get(name);
        const bucket = attendanceBySubject.get(name);
        return {
          subject: name,
          average: marks?.average_score ?? 0,
          scoresCount: marks?.scores_count ?? 0,
          attendanceRate: bucket && bucket.total > 0 ? (bucket.present / bucket.total) * 100 : null,
          band: bandFor(marks?.average_score ?? 0),
        };
      })
      .sort((left, right) => right.average - left.average);
  }, [performance, subjects, attendanceBySubject]);

  const scored = rows.filter((row) => row.scoresCount > 0);
  const atRisk = scored.filter((row) => row.band === 'at risk');
  const trend = performance?.trend || [];
  const trendDirection = trend.length >= 2
    ? trend[trend.length - 1].average_score - trend[0].average_score
    : null;

  /**
   * Attendance that is holding a subject back: present far less often than the
   * class average and scoring below the pass mark in the same subject.
   */
  const attendanceDrag = scored.filter(
    (row) => row.attendanceRate !== null && row.attendanceRate < 75 && row.average < PASS_MARK,
  );

  const handleExport = () => {
    exportExcel(
      [
        {
          name: 'Subjects',
          rows: rows.map((row) => ({
            Subject: row.subject,
            'Average score': row.scoresCount ? Number(row.average.toFixed(1)) : 'No marks yet',
            'Marks recorded': row.scoresCount,
            Attendance: row.attendanceRate === null ? 'Not recorded' : Number(row.attendanceRate.toFixed(1)),
            Standing: row.band,
          })),
        },
        {
          name: 'Terms',
          rows: trend.map((item) => ({
            Term: item.term,
            'Average score': item.average_score,
            'Marks recorded': item.scores_count,
          })),
        },
        {
          name: 'Marks',
          rows: scores.map((score) => ({
            Subject: score.subject?.name ?? '—',
            Assessment: score.assessment?.name ?? 'Direct entry',
            Term: score.term ?? '—',
            Score: score.score,
            Grade: score.grade ?? '—',
          })),
        },
      ],
      'student-performance',
      { generatedBy: user?.name ?? 'Student', reportTitle: 'Performance Report' },
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }

  return (
    <ReportPage>
      <ReportPrintStyles />
      <ReportToolbar
        title="Performance"
        description="Your marks by subject and by term, with the attendance recorded against each subject."
        eyebrow="Student report"
      >
        <ReportActionButton onClick={load} icon={RefreshCw}>Refresh</ReportActionButton>
        <ReportActionButton onClick={() => window.print()} icon={Printer}>Print</ReportActionButton>
        <ReportActionButton onClick={handleExport} icon={Download} variant="success">Export</ReportActionButton>
      </ReportToolbar>

      <ReportSurface>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ReportMetricCard
            label="Overall average"
            value={fmtPct(performance?.average_score)}
            accent="cyan"
            helper={`${scored.length} subject${scored.length === 1 ? '' : 's'} with marks`}
          />
          <ReportMetricCard
            label="Best subject"
            value={scored[0]?.subject ?? '—'}
            accent="emerald"
            helper={scored[0] ? fmtPct(scored[0].average) : 'Waiting for marks'}
          />
          <ReportMetricCard
            label="Needs attention"
            value={atRisk.length}
            accent={atRisk.length > 0 ? 'rose' : 'slate'}
            helper={`Subjects below ${PASS_MARK}%`}
          />
          <ReportMetricCard
            label="Term movement"
            value={trendDirection === null ? '—' : `${trendDirection >= 0 ? '+' : ''}${trendDirection.toFixed(1)}pp`}
            accent={trendDirection !== null && trendDirection < 0 ? 'amber' : 'violet'}
            helper={trendDirection === null ? 'Needs two terms of marks' : 'First visible term to latest'}
          />
        </div>

        {attendanceDrag.length > 0 ? (
          <ReportNotice tone="warning" icon={TrendingUp} className="mt-6">
            Attendance is below 75% in {attendanceDrag.length} subject
            {attendanceDrag.length === 1 ? '' : 's'} you are also failing
            ({attendanceDrag.map((row) => row.subject).join(', ')}). Missed sessions are the first
            thing to fix there — revision alone will not close a gap caused by lessons you were not in.
          </ReportNotice>
        ) : null}
      </ReportSurface>

      <ReportSurface className="mt-6">
        <ReportSectionTitle>Average score by subject</ReportSectionTitle>
        {scored.length === 0 ? (
          <p className="text-sm text-slate-500">No marks have been recorded against your subjects yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(240, scored.length * 38)}>
            <BarChart data={scored} layout="vertical" margin={{ left: 12, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis dataKey="subject" type="category" tick={{ fontSize: 11, fill: '#94a3b8' }} width={150} />
              <Tooltip formatter={(value) => fmtPct(Number(value ?? 0))} />
              <ReferenceLine x={PASS_MARK} stroke="#f59e0b" strokeDasharray="4 4" />
              <Bar dataKey="average" fill="#34d399" radius={[0, 8, 8, 0]} name="Average score" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ReportSurface>

      <ReportSurface className="mt-6">
        <ReportSectionTitle>Average score by term</ReportSectionTitle>
        {trend.length === 0 ? (
          <p className="text-sm text-slate-500">No term-attributed marks yet, so there is no trend to plot.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="term" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip formatter={(value) => fmtPct(Number(value ?? 0))} />
              <ReferenceLine y={PASS_MARK} stroke="#f59e0b" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="average_score" stroke="#22d3ee" strokeWidth={3} dot={{ r: 4, fill: '#22d3ee' }} name="Average score" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ReportSurface>

      <ReportSurface className="mt-6">
        <ReportSectionTitle>Subject breakdown</ReportSectionTitle>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-3 text-left">Subject</th>
                <th className="px-3 py-3 text-center">Average</th>
                <th className="px-3 py-3 text-center">Marks recorded</th>
                <th className="px-3 py-3 text-center">Attendance</th>
                <th className="px-3 py-3 text-center">Standing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    You have no subjects assigned yet.
                  </td>
                </tr>
              ) : rows.map((row) => (
                <tr key={row.subject} className="hover:bg-slate-800/40">
                  <td className="px-3 py-3 font-medium text-slate-100">{row.subject}</td>
                  <td className="px-3 py-3 text-center font-semibold text-slate-200">
                    {row.scoresCount ? fmtPct(row.average) : '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-slate-400">{row.scoresCount}</td>
                  <td className="px-3 py-3 text-center text-slate-400">{fmtPct(row.attendanceRate)}</td>
                  <td className="px-3 py-3 text-center">
                    {row.scoresCount === 0 ? (
                      <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-500">No marks yet</span>
                    ) : (
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${BAND_STYLE[row.band]}`}>
                        {row.band}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportSurface>
    </ReportPage>
  );
}
