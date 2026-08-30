import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Download, Printer, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  syllabusCoverageAPI,
  type CoverageOversightReport,
  type CoverageStatus,
} from '../api/syllabusCoverage';
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
 * The administrator's half of course coverage validation.
 *
 * Reported coverage is what the trainer entered; recognised coverage is what
 * their learners confirmed. The gap between the two is the number a head of
 * department is actually looking for — a trainer reporting a finished syllabus
 * to a class that recognises two thirds of it is the case this report exists
 * to surface.
 */

const STATUS_STYLE: Record<CoverageStatus, { label: string; className: string }> = {
  flagged:     { label: 'Variance',    className: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  confirmed:   { label: 'Confirmed',   className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  unvalidated: { label: 'No responses', className: 'bg-slate-700/40 text-slate-400 border-slate-700' },
};

const pct = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)}%`);

export default function CourseCoverageOversightPage() {
  const [data, setData] = useState<CoverageOversightReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await syllabusCoverageAPI.getOversightReport());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the coverage report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleExport = () => {
    if (!data) return;
    exportExcel(
      [{ name: 'Course Coverage', rows: data.rows as unknown as Record<string, unknown>[] }],
      `course-coverage-${data.term.name ?? 'all'}`,
      { generatedBy: data.scope.label, reportTitle: 'Course Coverage Validation' },
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
        title="Course Coverage"
        description="Syllabus coverage as reported by each trainer, next to the coverage their learners confirm."
        eyebrow="Oversight"
      >
        <ReportActionButton onClick={load} icon={RefreshCw}>Refresh</ReportActionButton>
        <ReportActionButton onClick={() => window.print()} icon={Printer}>Print</ReportActionButton>
        <ReportActionButton onClick={handleExport} icon={Download} variant="success">Export</ReportActionButton>
      </ReportToolbar>

      <ReportSurface>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-200">
            {data?.scope.label}
          </span>
          {data?.term.name && (
            <span className="rounded-full border border-slate-700 px-3 py-1">{data.term.name}</span>
          )}
          <span>
            Flagged at a gap of {data?.thresholds.variance_flag}pp or more, once at least{' '}
            {data?.thresholds.min_responses} learner responses are in.
          </span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ReportMetricCard label="Trainer / subject pairings" value={data?.summary.pairings ?? 0} accent="cyan" />
          <ReportMetricCard
            label="Average Reported"
            value={`${data?.summary.avg_reported_pct ?? 0}%`}
            accent="violet"
          />
          <ReportMetricCard
            label="Average Recognised"
            value={pct(data?.summary.avg_recognised_pct ?? null)}
            accent="emerald"
            helper={data?.summary.avg_recognised_pct === null ? 'No learner responses yet' : undefined}
          />
          <ReportMetricCard
            label="Flagged for review"
            value={data?.summary.flagged ?? 0}
            accent="amber"
            helper={`${data?.summary.unvalidated ?? 0} awaiting learner responses`}
          />
        </div>

        {(data?.summary.flagged ?? 0) > 0 && (
          <ReportNotice tone="warning" icon={AlertTriangle}>
            {data?.summary.flagged} trainer/subject pairing
            {data?.summary.flagged === 1 ? '' : 's'} report more coverage than the class recognises.
            Reported coverage is self-entered, so a persistent gap is worth raising with the trainer
            before it reaches the learners' results.
          </ReportNotice>
        )}
      </ReportSurface>

      <ReportSurface>
        <ReportSectionTitle className="flex items-center gap-2">
          <ShieldCheck size={16} /> Reported vs recognised coverage — largest gap first
        </ReportSectionTitle>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-3 text-left">Trainer</th>
                <th className="px-3 py-3 text-left">Subject</th>
                <th className="px-3 py-3 text-left">Department</th>
                <th className="px-3 py-3 text-center">Topics</th>
                <th className="px-3 py-3 text-center">Reported</th>
                <th className="px-3 py-3 text-center">Recognised</th>
                <th className="px-3 py-3 text-center">Gap</th>
                <th className="px-3 py-3 text-center">Learners</th>
                <th className="px-3 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(data?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    No syllabus topics have been recorded in this scope yet.
                  </td>
                </tr>
              ) : (
                data?.rows.map((row) => {
                  const style = STATUS_STYLE[row.status];
                  return (
                    <tr key={`${row.trainer_id}-${row.subject_id}`} className="hover:bg-slate-800/40">
                      <td className="px-3 py-3 font-medium text-slate-100">{row.trainer_name}</td>
                      <td className="px-3 py-3 text-slate-300">
                        {row.subject_name}
                        {row.subject_code ? <span className="text-slate-500"> · {row.subject_code}</span> : null}
                      </td>
                      <td className="px-3 py-3 text-slate-400">{row.department_name ?? '—'}</td>
                      <td className="px-3 py-3 text-center text-slate-400">
                        {row.covered_topics}/{row.total_topics}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-violet-300">
                        {row.reported_pct.toFixed(1)}%
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-emerald-300">
                        {pct(row.recognised_pct)}
                      </td>
                      <td className={`px-3 py-3 text-center font-bold ${
                        row.variance === null ? 'text-slate-500'
                        : row.variance >= (data?.thresholds.variance_flag ?? 20) ? 'text-rose-300'
                        : 'text-slate-300'
                      }`}>
                        {row.variance === null ? '—' : `${row.variance > 0 ? '+' : ''}${row.variance.toFixed(1)}pp`}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-400">{row.respondents}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${style.className}`}>
                          {style.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </ReportSurface>
    </ReportPage>
  );
}
