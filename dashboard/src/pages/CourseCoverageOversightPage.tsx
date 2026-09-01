import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Download, Printer, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
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

const STATUS_ORDER: CoverageStatus[] = ['flagged', 'confirmed', 'unvalidated'];

export default function CourseCoverageOversightPage() {
  const [data, setData] = useState<CoverageOversightReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState('all');
  const [subject, setSubject] = useState('all');
  const [status, setStatus] = useState<'all' | CoverageStatus>('all');
  const [search, setSearch] = useState('');

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

  const rows = useMemo(() => data?.rows ?? [], [data]);

  const departments = useMemo(
    () => Array.from(new Set(rows.map((row) => row.department_name).filter(Boolean) as string[])).sort(),
    [rows],
  );

  /**
   * Subject choices follow the department already picked, so the two filters
   * cannot be combined into a pairing that has no rows behind it.
   */
  const subjects = useMemo(() => {
    const scoped = department === 'all' ? rows : rows.filter((row) => row.department_name === department);
    return Array.from(new Set(scoped.map((row) => row.subject_name))).sort();
  }, [rows, department]);

  useEffect(() => {
    if (subject !== 'all' && !subjects.includes(subject)) setSubject('all');
  }, [subjects, subject]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => (
      (department === 'all' || row.department_name === department)
      && (subject === 'all' || row.subject_name === subject)
      && (status === 'all' || row.status === status)
      && (!query || row.trainer_name.toLowerCase().includes(query) || row.subject_name.toLowerCase().includes(query))
    ));
  }, [rows, department, subject, status, search]);

  const statusCounts = useMemo(() => {
    const counts: Record<CoverageStatus, number> = { flagged: 0, confirmed: 0, unvalidated: 0 };
    rows.forEach((row) => { counts[row.status] += 1; });
    return counts;
  }, [rows]);

  const filtersActive = department !== 'all' || subject !== 'all' || status !== 'all' || search.trim() !== '';

  const clearFilters = () => {
    setDepartment('all');
    setSubject('all');
    setStatus('all');
    setSearch('');
  };

  const handleExport = () => {
    if (!data) return;
    exportExcel(
      [{ name: 'Course Coverage', rows: visibleRows as unknown as Record<string, unknown>[] }],
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Department
              <select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-100 outline-none focus:border-cyan-400"
              >
                <option value="all">All departments</option>
                {departments.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>

            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Subject
              <select
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-100 outline-none focus:border-cyan-400"
              >
                <option value="all">All subjects</option>
                {subjects.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>

            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as 'all' | CoverageStatus)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-100 outline-none focus:border-cyan-400"
              >
                <option value="all">All statuses ({rows.length})</option>
                {STATUS_ORDER.map((key) => (
                  <option key={key} value={key}>{STATUS_STYLE[key].label} ({statusCounts[key]})</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Trainer
              <span className="relative mt-1.5 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search trainer or subject"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2 pl-9 pr-3 text-sm font-normal normal-case tracking-normal text-slate-100 outline-none focus:border-cyan-400"
                />
              </span>
            </label>
          </div>

          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white print:hidden lg:self-end"
            >
              <X size={14} /> Clear filters
            </button>
          ) : null}
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Showing {visibleRows.length} of {rows.length} trainer/subject pairing{rows.length === 1 ? '' : 's'}.
          Print and export follow these filters.
        </p>
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
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    {rows.length === 0
                      ? 'No syllabus topics have been recorded in this scope yet.'
                      : 'No pairings match these filters.'}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
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
