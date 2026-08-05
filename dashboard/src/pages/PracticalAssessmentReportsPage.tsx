import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  BarChart3,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  Printer,
  RotateCcw,
  Search,
  Users,
} from 'lucide-react';
import {
  assessmentReportsAPI,
  type PracticalDetailedReport,
  type PracticalFilters,
  type PracticalSummaryReport,
} from '../api/assessmentReports';
import { exportCSV, exportExcel, exportPDF } from '../utils/exportUtils';
import { competenceTone } from '../utils/competence';
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

type ViewMode = 'summary' | 'detailed';

const emptyFilters: PracticalFilters = {
  course_id: '',
  trainer_id: '',
  status: 'all',
  outcome: 'all',
  unit_code: 'all',
  date_from: '',
  date_to: '',
};

const outcomeTone = competenceTone;

const statusTone: Record<string, string> = {
  draft: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  complete: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
  released: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
};

const selectCls =
  'w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-400/60';

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatPct = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${value}%`;

function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
      {label}
    </span>
  );
}

export default function PracticalAssessmentReportsPage() {
  const [view, setView] = useState<ViewMode>('summary');
  const [filters, setFilters] = useState<PracticalFilters>(emptyFilters);
  const [summary, setSummary] = useState<PracticalSummaryReport | null>(null);
  const [detailed, setDetailed] = useState<PracticalDetailedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (view === 'summary') {
        setSummary(await assessmentReportsAPI.getPracticalSummary(filters));
      } else {
        setDetailed(await assessmentReportsAPI.getPracticalDetailed(filters));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load practical assessment report');
    } finally {
      setLoading(false);
    }
  }, [filters, view]);

  useEffect(() => {
    load();
  }, [load]);

  const active = view === 'summary' ? summary : detailed;
  const filterOptions = active?.filter_options;

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!detailed) return [];
    if (!query) return detailed.rows;
    return detailed.rows.filter((row) =>
      [row.student_name, row.registration_number, row.unit_of_competency, row.assessor_name, row.course_name]
        .some((field) => (field ?? '').toLowerCase().includes(query)),
    );
  }, [detailed, search]);

  const exportSheets = useMemo(() => {
    if (view === 'summary' && summary) {
      return [
        {
          name: 'Overview',
          rows: [
            {
              total_reports: summary.summary.total_reports,
              learners_assessed: summary.summary.learners_assessed,
              units_covered: summary.summary.units_covered,
              attained_mastery: summary.summary.attained_mastery,
              proficient: summary.summary.proficient,
              competent: summary.summary.competent,
              not_yet_competent: summary.summary.not_yet_competent,
              incomplete: summary.summary.incomplete,
              competency_rate: summary.summary.competency_rate,
              average_score_pct: summary.summary.average_score_pct,
            },
          ] as Record<string, unknown>[],
        },
        { name: 'By Unit', rows: summary.by_unit as unknown as Record<string, unknown>[] },
        { name: 'By Assessor', rows: summary.by_assessor as unknown as Record<string, unknown>[] },
        { name: 'By Course', rows: summary.by_course as unknown as Record<string, unknown>[] },
        { name: 'Outcomes', rows: summary.outcome_distribution as unknown as Record<string, unknown>[] },
      ];
    }
    if (view === 'detailed' && detailed) {
      const learnerRows = visibleRows.map((row) => ({
        student_name: row.student_name,
        registration_number: row.registration_number,
        course_name: row.course_name,
        unit_code: row.unit_code,
        unit_of_competency: row.unit_of_competency,
        assessor_name: row.assessor_name,
        assessment_date: formatDate(row.assessment_date),
        venue: row.assessment_venue ?? '—',
        total_score: row.total_score,
        total_max_score: row.total_max_score,
        score_percentage: row.score_percentage,
        competency_outcome: row.competency_outcome,
        status: row.status,
        tasks_scored: `${row.tasks_scored}/${row.tasks_total}`,
        oral_scored: `${row.oral_questions_scored}/${row.oral_questions_total}`,
      }));
      const taskRows = visibleRows.flatMap((row) =>
        row.tasks.map((task) => ({
          student_name: row.student_name,
          registration_number: row.registration_number,
          unit_code: row.unit_code,
          section: task.section,
          task_number: task.number,
          task: task.prompt ?? '—',
          score: task.score,
          max_score: task.max_score,
          remark: task.remark ?? '',
        })),
      );
      return [
        { name: 'Learners', rows: learnerRows as Record<string, unknown>[] },
        { name: 'Task Breakdown', rows: taskRows as Record<string, unknown>[] },
      ];
    }
    return [];
  }, [detailed, summary, view, visibleRows]);

  const exportMeta = {
    generatedBy: active?.generated_by ?? 'Unknown',
    reportTitle: view === 'summary'
      ? 'Practical Assessment — Summary Report'
      : 'Practical Assessment — Detailed Report',
    subtitle: active?.school.name,
  };
  const exportName = `practical-assessments-${view}`;

  const updateFilter = (key: keyof PracticalFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  if (loading && !active) {
    return (
      <ReportPage>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-cyan-400" />
        </div>
      </ReportPage>
    );
  }

  if (error && !active) {
    return (
      <ReportPage>
        <div className="mx-auto flex min-h-[60vh] max-w-6xl items-center">
          <ReportNotice icon={AlertCircle} tone="error">{error}</ReportNotice>
        </div>
      </ReportPage>
    );
  }

  if (!active) return null;

  const stats = active.summary;

  return (
    <ReportPage>
      <ReportToolbar
        title="Practical Assessment Reports"
        description="Competency outcomes across CDACC practical assessments — aggregated for oversight, or listed learner by learner with the full task breakdown."
        eyebrow={active.scope === 'own' ? 'My Assessments' : 'Institution Reports'}
      >
        <ReportActionButton onClick={() => window.print()} icon={Printer}>Print</ReportActionButton>
        <ReportActionButton
          onClick={() => exportExcel(exportSheets, exportName, exportMeta)}
          icon={Download}
          variant="success"
          disabled={exportSheets.length === 0}
        >
          Excel
        </ReportActionButton>
        <ReportActionButton
          onClick={() => exportPDF(exportSheets, exportName, exportMeta)}
          icon={FileText}
          variant="warning"
          disabled={exportSheets.length === 0}
        >
          PDF
        </ReportActionButton>
        <ReportActionButton
          onClick={() => exportCSV(exportSheets[0]?.rows ?? [], exportName)}
          icon={Download}
          variant="primary"
          disabled={exportSheets.length === 0}
        >
          CSV
        </ReportActionButton>
      </ReportToolbar>

      <ReportSurface maxWidth="max-w-7xl">
        <div className="border-b border-white/10 pb-6 text-center">
          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70 print:block">Confidential</p>
          <h1 className="mt-3 text-2xl font-semibold uppercase tracking-[0.16em] text-white sm:text-3xl">{active.school.name}</h1>
          {active.school.location ? <p className="mt-2 text-sm text-slate-400">{active.school.location}</p> : null}
          <h2 className="mt-4 text-lg font-semibold uppercase tracking-[0.18em] text-slate-100">
            Practical Assessment {view === 'summary' ? 'Summary' : 'Detailed Record'}
          </h2>
        </div>

        {/* View toggle + filters */}
        <div className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/40 p-4 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            {(['summary', 'detailed'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold capitalize transition ${
                  view === mode
                    ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-100'
                    : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'summary' ? 'Summary view' : 'Detailed view'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setFilters(emptyFilters); setSearch(''); }}
              className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select className={selectCls} value={filters.course_id} onChange={(e) => updateFilter('course_id', e.target.value)}>
              <option value="">All courses</option>
              {filterOptions?.courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
            <select className={selectCls} value={filters.trainer_id} onChange={(e) => updateFilter('trainer_id', e.target.value)}>
              <option value="">All assessors</option>
              {filterOptions?.trainers.map((trainer) => (
                <option key={trainer.id} value={trainer.id}>{trainer.name}</option>
              ))}
            </select>
            <select className={selectCls} value={filters.unit_code} onChange={(e) => updateFilter('unit_code', e.target.value)}>
              <option value="all">All units</option>
              {filterOptions?.units.map((unit) => (
                <option key={unit.unit_code} value={unit.unit_code}>
                  {unit.unit_code} — {unit.unit_of_competency}
                </option>
              ))}
            </select>
            <select className={selectCls} value={filters.outcome} onChange={(e) => updateFilter('outcome', e.target.value)}>
              <option value="all">All outcomes</option>
              {filterOptions?.outcomes.map((outcome) => (
                <option key={outcome} value={outcome}>{outcome}</option>
              ))}
            </select>
            <select className={selectCls} value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
              <option value="all">All statuses</option>
              {filterOptions?.statuses.map((status) => (
                <option key={status} value={status} className="capitalize">{status}</option>
              ))}
            </select>
            <input
              type="date"
              className={selectCls}
              value={filters.date_from}
              onChange={(e) => updateFilter('date_from', e.target.value)}
              aria-label="Assessed from"
            />
            <input
              type="date"
              className={selectCls}
              value={filters.date_to}
              onChange={(e) => updateFilter('date_to', e.target.value)}
              aria-label="Assessed to"
            />
            {view === 'detailed' ? (
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search learner, unit, assessor"
                  className={`${selectCls} pl-9`}
                />
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mt-4"><ReportNotice icon={AlertCircle} tone="error">{error}</ReportNotice></div>
        ) : null}

        {/* Headline metrics — shared by both views */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ReportMetricCard label="Reports" value={stats.total_reports} icon={ClipboardList} accent="cyan" />
          <ReportMetricCard label="Learners Assessed" value={stats.learners_assessed} icon={Users} accent="violet" />
          <ReportMetricCard
            label="Competency Rate"
            value={`${stats.competency_rate}%`}
            icon={Award}
            accent="emerald"
            helper={`${stats.attained_mastery} mastery · ${stats.proficient} proficient · ${stats.competent} competent · ${stats.not_yet_competent} not yet`}
          />
          <ReportMetricCard
            label="Average Score"
            value={formatPct(stats.average_score_pct)}
            icon={BarChart3}
            accent="amber"
            helper={`High ${formatPct(stats.highest_score_pct)} · Low ${formatPct(stats.lowest_score_pct)}`}
          />
        </div>

        {view === 'summary' && summary ? (
          <SummaryView report={summary} />
        ) : null}

        {view === 'detailed' && detailed ? (
          <DetailedView
            report={detailed}
            rows={visibleRows}
            expanded={expanded}
            onToggle={(id) => setExpanded((current) => (current === id ? null : id))}
          />
        ) : null}

        <p className="mt-8 border-t border-white/10 pt-4 text-center text-xs text-slate-500">
          Generated {new Date(active.generated_at).toLocaleString()} by {active.generated_by}
        </p>
      </ReportSurface>

      <ReportPrintStyles />
    </ReportPage>
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────

function SummaryView({ report }: { report: PracticalSummaryReport }) {
  const total = report.summary.total_reports;
  return (
    <>
      <section className="mt-8">
        <ReportSectionTitle>Outcome Distribution</ReportSectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.outcome_distribution.map((entry) => (
            <div key={entry.outcome} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <Badge label={entry.outcome} tone={outcomeTone[entry.outcome] ?? outcomeTone.INCOMPLETE} />
              <p className="mt-3 text-2xl font-semibold text-white">{entry.count}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-cyan-400/70"
                  style={{ width: `${total ? entry.pct : 0}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">{entry.pct}% of reports</p>
            </div>
          ))}
        </div>
      </section>

      <SummaryTable
        title="By Unit of Competency"
        headers={['Unit Code', 'Unit', 'Reports', 'Learners', 'Avg %', 'Competent', 'Competency Rate']}
        rows={report.by_unit.map((row) => [
          row.unit_code,
          row.unit_of_competency,
          row.reports,
          row.learners,
          formatPct(row.avg_score_pct),
          row.competent,
          `${row.competency_rate}%`,
        ])}
      />

      <SummaryTable
        title="By Assessor"
        headers={['Assessor', 'Reports', 'Learners', 'Avg %', 'Competent', 'Competency Rate']}
        rows={report.by_assessor.map((row) => [
          row.assessor_name,
          row.reports,
          row.learners,
          formatPct(row.avg_score_pct),
          row.competent,
          `${row.competency_rate}%`,
        ])}
      />

      <SummaryTable
        title="By Course"
        headers={['Course', 'Reports', 'Learners', 'Avg %', 'Competent', 'Competency Rate']}
        rows={report.by_course.map((row) => [
          row.course_name,
          row.reports,
          row.learners,
          formatPct(row.avg_score_pct),
          row.competent,
          `${row.competency_rate}%`,
        ])}
      />
    </>
  );
}

function SummaryTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <section className="mt-8">
      <ReportSectionTitle>{title}</ReportSectionTitle>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
          No records match the selected filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-white/[0.04]">
              <tr>
                {headers.map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row, index) => (
                <tr key={index} className="hover:bg-white/[0.02]">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={`px-4 py-3 ${cellIndex === 0 ? 'font-medium text-slate-100' : 'text-slate-300'}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Detailed ─────────────────────────────────────────────────────────────────

function DetailedView({
  report,
  rows,
  expanded,
  onToggle,
}: {
  report: PracticalDetailedReport;
  rows: PracticalDetailedReport['rows'];
  expanded: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ReportSectionTitle className="mb-0">Learner Records</ReportSectionTitle>
        <p className="text-xs text-slate-500">
          Showing {rows.length} of {report.total_matching}
          {report.truncated ? ' (result set capped — narrow the filters for the full list)' : ''}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
          No practical assessment records match the selected filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-white/[0.04]">
              <tr>
                {['Learner', 'Course', 'Unit', 'Assessor', 'Date', 'Score', 'Outcome', 'Status', ''].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <Fragment key={row.report_id}>
                  <tr className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-100">{row.student_name}</p>
                      <p className="text-xs text-slate-500">{row.registration_number}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{row.course_name}</td>
                    <td className="px-4 py-3">
                      <p className="text-slate-300">{row.unit_of_competency}</p>
                      <p className="text-xs text-slate-500">{row.unit_code}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{row.assessor_name}</td>
                    <td className="px-4 py-3 text-slate-300">{formatDate(row.assessment_date)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-100">
                        {row.total_score ?? '—'}<span className="text-slate-500"> / {row.total_max_score ?? '—'}</span>
                      </p>
                      <p className="text-xs text-slate-500">{formatPct(row.score_percentage)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={row.competency_outcome} tone={outcomeTone[row.competency_outcome] ?? outcomeTone.INCOMPLETE} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={row.status} tone={statusTone[row.status] ?? statusTone.draft} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onToggle(row.report_id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/5 print:hidden"
                        aria-expanded={expanded === row.report_id}
                      >
                        {expanded === row.report_id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        Tasks
                      </button>
                    </td>
                  </tr>
                  {expanded === row.report_id ? (
                    <tr className="bg-slate-950/60">
                      <td colSpan={9} className="px-4 py-4">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Task breakdown · {row.tasks_scored}/{row.tasks_total} scored
                          {row.oral_questions_total
                            ? ` · oral ${row.oral_questions_scored}/${row.oral_questions_total}`
                            : ''}
                        </p>
                        <div className="overflow-x-auto rounded-xl border border-white/10">
                          <table className="w-full min-w-[600px] text-xs">
                            <thead className="bg-white/[0.03]">
                              <tr>
                                {['Section', '#', 'Task', 'Score', 'Max', 'Remark'].map((header) => (
                                  <th key={header} className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {row.tasks.length === 0 ? (
                                <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-500">No task rows recorded.</td></tr>
                              ) : row.tasks.map((task, index) => (
                                <tr key={`${row.report_id}-${index}`}>
                                  <td className="px-3 py-2 text-slate-400">{task.section}</td>
                                  <td className="px-3 py-2 text-slate-400">{task.number ?? '—'}</td>
                                  <td className="px-3 py-2 text-slate-200">{task.prompt ?? '—'}</td>
                                  <td className="px-3 py-2 font-semibold text-slate-100">{task.score ?? '—'}</td>
                                  <td className="px-3 py-2 text-slate-400">{task.max_score ?? '—'}</td>
                                  <td className="px-3 py-2 text-slate-400">{task.remark ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {row.general_remarks ? (
                          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-slate-300">
                            <span className="font-semibold text-slate-400">Assessor remarks: </span>
                            {row.general_remarks}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
