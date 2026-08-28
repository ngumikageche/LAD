import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Award,
  BarChart3,
  Download,
  FileText,
  GraduationCap,
  Printer,
  RotateCcw,
  Search,
  Users,
} from 'lucide-react';
import {
  assessmentReportsAPI,
  type ExamDetailedReport,
  type ExamFilters,
  type ExamSummaryReport,
} from '../api/assessmentReports';
import { exportCSV, exportExcel, exportPDF } from '../utils/exportUtils';
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

const emptyFilters: ExamFilters = {
  term_id: '',
  course_id: '',
  subject_id: '',
  assessment_id: '',
  assessment_type: 'all',
};

const selectCls =
  'w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-400/60';

const formatPct = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${value}%`;

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

function PassRateBar({ value }: { value: number }) {
  const tone = value >= 75 ? 'bg-emerald-400/70' : value >= 50 ? 'bg-amber-400/70' : 'bg-rose-400/70';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="text-xs text-slate-400">{value}%</span>
    </div>
  );
}

export default function ExamResultsAnalysisPage() {
  const [view, setView] = useState<ViewMode>('summary');
  const [filters, setFilters] = useState<ExamFilters>(emptyFilters);
  const [summary, setSummary] = useState<ExamSummaryReport | null>(null);
  const [detailed, setDetailed] = useState<ExamDetailedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<'all' | 'pass' | 'fail'>('all');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (view === 'summary') {
        setSummary(await assessmentReportsAPI.getExamSummary(filters));
      } else {
        setDetailed(await assessmentReportsAPI.getExamDetailed(filters));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exam results report');
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
    if (!detailed) return [];
    const query = search.trim().toLowerCase();
    return detailed.rows.filter((row) => {
      const matchesQuery = !query
        || [row.student_name, row.registration_number, row.subject_name, row.assessment_name, row.course_name]
          .some((field) => (field ?? '').toLowerCase().includes(query));
      const matchesOutcome = outcome === 'all'
        || (outcome === 'pass' && row.passed)
        || (outcome === 'fail' && !row.passed);
      return matchesQuery && matchesOutcome;
    });
  }, [detailed, outcome, search]);

  const exportSheets = useMemo(() => {
    if (view === 'summary' && summary) {
      return [
        {
          name: 'Overview',
          rows: [summary.summary] as unknown as Record<string, unknown>[],
        },
        { name: 'By Assessment', rows: summary.by_assessment as unknown as Record<string, unknown>[] },
        { name: 'By Subject', rows: summary.by_subject as unknown as Record<string, unknown>[] },
        { name: 'By Course', rows: summary.by_course as unknown as Record<string, unknown>[] },
        { name: 'Grades', rows: summary.grade_distribution as unknown as Record<string, unknown>[] },
      ];
    }
    if (view === 'detailed' && detailed) {
      return [
        {
          name: 'Score Entries',
          rows: visibleRows.map((row) => ({
            student_name: row.student_name,
            registration_number: row.registration_number,
            course_name: row.course_name,
            subject_name: row.subject_name,
            assessment_name: row.assessment_name,
            assessment_type: row.assessment_type,
            term: row.term,
            marks_obtained: row.marks_obtained,
            total_marks: row.total_marks,
            percentage: row.percentage,
            grade: row.grade,
            outcome: row.outcome,
            trainer_name: row.trainer_name,
            recorded_at: formatDate(row.recorded_at),
            feedback: row.feedback ?? '',
          })) as Record<string, unknown>[],
        },
      ];
    }
    return [];
  }, [detailed, summary, view, visibleRows]);

  const exportMeta = {
    generatedBy: active?.generated_by ?? 'Unknown',
    reportTitle: view === 'summary' ? 'Exam Results — Summary Report' : 'Exam Results — Detailed Report',
    subtitle: active?.school.name,
  };
  const exportName = `exam-results-${view}`;

  const updateFilter = (key: keyof ExamFilters, value: string) =>
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
        title="Exam Results Reports"
        description="Recorded exam, assignment, quiz, and project outcomes — aggregated by assessment, subject, and course, or listed as individual learner entries."
        eyebrow={active.scope === 'own' ? 'My Subjects' : 'Institution Reports'}
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
            Exam Results {view === 'summary' ? 'Summary' : 'Detailed Record'}
          </h2>
        </div>

        <div className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/40 p-4 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            {(['summary', 'detailed'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
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
              onClick={() => { setFilters(emptyFilters); setSearch(''); setOutcome('all'); }}
              className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <select className={selectCls} value={filters.term_id} onChange={(e) => updateFilter('term_id', e.target.value)}>
              <option value="">All terms</option>
              {filterOptions?.terms.map((term) => (
                <option key={term.id} value={term.id}>{term.name}</option>
              ))}
            </select>
            <select className={selectCls} value={filters.course_id} onChange={(e) => updateFilter('course_id', e.target.value)}>
              <option value="">All courses</option>
              {filterOptions?.courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
            <select className={selectCls} value={filters.subject_id} onChange={(e) => updateFilter('subject_id', e.target.value)}>
              <option value="">All subjects</option>
              {filterOptions?.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
            <select className={selectCls} value={filters.assessment_id} onChange={(e) => updateFilter('assessment_id', e.target.value)}>
              <option value="">All assessments</option>
              {filterOptions?.assessments.map((assessment) => (
                <option key={assessment.id} value={assessment.id}>{assessment.name}</option>
              ))}
            </select>
            <select className={selectCls} value={filters.assessment_type} onChange={(e) => updateFilter('assessment_type', e.target.value)}>
              <option value="all">All types</option>
              {filterOptions?.assessment_types.map((type) => (
                <option key={type} value={type} className="capitalize">{type}</option>
              ))}
            </select>
            {view === 'detailed' ? (
              <>
                <select className={selectCls} value={outcome} onChange={(e) => setOutcome(e.target.value as 'all' | 'pass' | 'fail')}>
                  <option value="all">Pass and fail</option>
                  <option value="pass">Passed only</option>
                  <option value="fail">Failed only</option>
                </select>
                <div className="relative sm:col-span-2 lg:col-span-3">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search learner, subject, assessment"
                    className={`${selectCls} pl-9`}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mt-4"><ReportNotice icon={AlertCircle} tone="error">{error}</ReportNotice></div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ReportMetricCard label="Score Entries" value={stats.total_entries} icon={GraduationCap} accent="cyan" />
          <ReportMetricCard label="Learners" value={stats.learners_assessed} icon={Users} accent="violet" />
          <ReportMetricCard
            label="Average Pass Rate"
            value={`${stats.pass_rate}%`}
            icon={Award}
            accent="emerald"
            helper={`${stats.passed} passed · ${stats.failed} failed`}
          />
          <ReportMetricCard
            label="Average Mark"
            value={stats.average_mark ?? '—'}
            icon={BarChart3}
            accent="amber"
            helper={`High ${stats.highest_mark ?? '—'} · Low ${stats.lowest_mark ?? '—'}`}
          />
        </div>

        {view === 'summary' && summary ? <ExamSummaryView report={summary} /> : null}

        {view === 'detailed' && detailed ? (
          <section className="mt-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <ReportSectionTitle className="mb-0">Score Entries</ReportSectionTitle>
              <p className="text-xs text-slate-500">
                Showing {visibleRows.length} of {detailed.total_matching}
                {detailed.truncated ? ' (result set capped — narrow the filters for the full list)' : ''}
              </p>
            </div>
            {visibleRows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
                No score entries match the selected filters.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-white/[0.04]">
                    <tr>
                      {['Learner', 'Course', 'Subject', 'Assessment', 'Term', 'Marks', '%', 'Grade', 'Outcome', 'Recorded By'].map((header) => (
                        <th key={header} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {visibleRows.map((row) => (
                      <tr key={row.score_id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-100">{row.student_name}</p>
                          <p className="text-xs text-slate-500">{row.registration_number}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{row.course_name}</td>
                        <td className="px-4 py-3 text-slate-300">{row.subject_name}</td>
                        <td className="px-4 py-3">
                          <p className="text-slate-300">{row.assessment_name}</p>
                          <p className="text-xs capitalize text-slate-500">{row.assessment_type}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{row.term}</td>
                        <td className="px-4 py-3 font-semibold text-slate-100">
                          {row.marks_obtained}<span className="text-slate-500"> / {row.total_marks}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{formatPct(row.percentage)}</td>
                        <td className="px-4 py-3 font-semibold text-slate-100">{row.grade}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ${
                            row.passed
                              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                              : 'border-rose-400/30 bg-rose-400/10 text-rose-200'
                          }`}>
                            {row.outcome}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{row.trainer_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        <p className="mt-8 border-t border-white/10 pt-4 text-center text-xs text-slate-500">
          Generated {new Date(active.generated_at).toLocaleString()} by {active.generated_by}
        </p>
      </ReportSurface>

      <ReportPrintStyles />
    </ReportPage>
  );
}

function ExamSummaryView({ report }: { report: ExamSummaryReport }) {
  return (
    <>
      <section className="mt-8">
        <ReportSectionTitle>Grade Distribution</ReportSectionTitle>
        {report.grade_distribution.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
            No grades recorded for the selected filters.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {report.grade_distribution.map((entry) => (
              <div key={entry.grade} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Grade {entry.grade}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{entry.count}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-cyan-400/70" style={{ width: `${entry.pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{entry.pct}% of entries</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <ExamTable
        title="By Assessment"
        headers={['Assessment', 'Type', 'Out Of', 'Entries', 'Learners', 'Avg Mark', 'Avg %', 'Pass Rate']}
        rows={report.by_assessment.map((row) => [
          row.assessment_name,
          row.assessment_type,
          row.total_marks,
          row.entries,
          row.learners,
          row.avg_marks ?? '—',
          formatPct(row.avg_pct),
          <PassRateBar key={row.assessment_id ?? row.assessment_name} value={row.pass_pct} />,
        ])}
      />

      <ExamTable
        title="By Subject"
        headers={['Subject', 'Entries', 'Learners', 'Avg Mark', 'Avg %', 'Highest', 'Lowest', 'Pass Rate']}
        rows={report.by_subject.map((row) => [
          row.subject_name,
          row.entries,
          row.learners,
          row.avg_marks ?? '—',
          formatPct(row.avg_pct),
          row.highest ?? '—',
          row.lowest ?? '—',
          <PassRateBar key={row.subject_id ?? row.subject_name} value={row.pass_pct} />,
        ])}
      />

      <ExamTable
        title="By Course"
        headers={['Course', 'Entries', 'Learners', 'Avg Mark', 'Avg %', 'Highest', 'Lowest', 'Pass Rate']}
        rows={report.by_course.map((row) => [
          row.course_name,
          row.entries,
          row.learners,
          row.avg_marks ?? '—',
          formatPct(row.avg_pct),
          row.highest ?? '—',
          row.lowest ?? '—',
          <PassRateBar key={row.course_id ?? row.course_name} value={row.pass_pct} />,
        ])}
      />
    </>
  );
}

function ExamTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: Array<Array<ReactNode>>;
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
          <table className="w-full min-w-[720px] text-sm">
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
                    <td
                      key={cellIndex}
                      className={`px-4 py-3 ${cellIndex === 0 ? 'font-medium text-slate-100' : 'capitalize text-slate-300'}`}
                    >
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
