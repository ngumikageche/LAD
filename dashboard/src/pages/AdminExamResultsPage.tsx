import { useState, useEffect, useMemo } from 'react';
import { Printer, AlertCircle, TrendingUp, TrendingDown, Download, Filter, Search, RotateCcw } from 'lucide-react';
import { adminReportsV2API } from '../api/admin';
import { exportExcel, exportCSV } from '../utils/exportUtils';
import { useTableControls } from '../hooks/useTableControls';
import { SortableTh } from '../components/ui/TableControls';
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

interface CourseRow {
  course_id: string; course_name: string; student_count: number;
  scores_count: number; avg_marks: number; pass_pct: number;
  top_student: string | null; top_mark: number;
}
interface SubjectRow {
  subject_id: string; subject_name: string; entries: number;
  avg_marks: number; pass_pct: number; fail_pct: number;
}
interface Trend { prev_term: string; avg_delta: number; pass_rate_delta: number; }
interface ExamReport {
  school: { name: string; location: string };
  term: { id: string | null; name: string | null };
  summary: { school_avg: number; pass_rate: number; total_scores: number; top_course: string | null };
  trend: Trend | null;
  by_course: CourseRow[];
  by_subject: SubjectRow[];
  filter_options: {
    terms: Array<{ id: string; name: string }>;
    departments: Array<{ id: string; name: string }>;
    courses: Array<{ id: string; name: string; department_id: string }>;
    subjects: Array<{ id: string; name: string; course_id: string | null }>;
  };
  generated_at: string;
  generated_by: string;
}

function TrendBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-slate-500 text-xs">—</span>;
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-300' : 'text-red-300'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '+' : ''}{delta}%
    </span>
  );
}

function matchesPerformanceBand(average: number, performance: string) {
  return performance === 'all'
    || (performance === 'strong' && average >= 75)
    || (performance === 'watch' && average >= 50 && average < 75)
    || (performance === 'critical' && average < 50);
}

export default function AdminExamResultsPage() {
  const [data, setData] = useState<ExamReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    term_id: '',
    department_id: '',
    course_id: '',
    subject_id: '',
  });
  const [search, setSearch] = useState('');
  const [performance, setPerformance] = useState('all');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await adminReportsV2API.getExamResults(filters) as ExamReport;
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [filters]);

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.by_course ?? []).filter((row) => (
      (!query || row.course_name.toLowerCase().includes(query) || (row.top_student ?? '').toLowerCase().includes(query))
      && matchesPerformanceBand(row.avg_marks, performance)
    ));
  }, [data?.by_course, search, performance]);

  const filteredSubjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.by_subject ?? []).filter((row) => (
      (!query || row.subject_name.toLowerCase().includes(query))
      && matchesPerformanceBand(row.avg_marks, performance)
    ));
  }, [data?.by_subject, search, performance]);

  const courseTable = useTableControls(filteredCourses, Math.max(filteredCourses.length, 1));
  const subjectTable = useTableControls(filteredSubjects, Math.max(filteredSubjects.length, 1));

  const availableCourses = (data?.filter_options?.courses ?? []).filter(
    (item) => !filters.department_id || item.department_id === filters.department_id,
  );
  const availableSubjects = (data?.filter_options?.subjects ?? []).filter(
    (item) => !filters.course_id || item.course_id === filters.course_id,
  );

  const handleExcelExport = () => {
    if (!data) return;
    exportExcel(
      [
        { name: 'By Course', rows: filteredCourses as unknown as Record<string, unknown>[] },
        { name: 'By Subject', rows: filteredSubjects as unknown as Record<string, unknown>[] },
      ],
      `exam-results-${data.term.name ?? 'all'}`,
      { generatedBy: data.generated_by, reportTitle: 'School-Wide Exam Results' }
    );
  };

  const handleCSVExport = () => {
    if (!data) return;
    exportCSV(filteredCourses as unknown as Record<string, unknown>[], `exam-results-courses-${data.term.name ?? 'all'}`);
  };

  if (loading) return (
    <ReportPage>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-cyan-400" />
      </div>
    </ReportPage>
  );

  if (error) return (
    <ReportPage>
      <div className="mx-auto flex min-h-[60vh] max-w-6xl items-center">
        <ReportNotice icon={AlertCircle} tone="error">{error}</ReportNotice>
      </div>
    </ReportPage>
  );

  if (!data) return null;

  return (
    <ReportPage>
      <ReportToolbar
        title="School-Wide Exam Results"
        description="Review term-wide academic performance across courses and subjects with export-ready reporting."
        eyebrow="Admin Reports"
      >
        <ReportActionButton onClick={() => window.print()} icon={Printer}>
          Print
        </ReportActionButton>
        <ReportActionButton onClick={handleExcelExport} icon={Download} variant="success">
          Excel
        </ReportActionButton>
        <ReportActionButton onClick={handleCSVExport} icon={Download} variant="primary">
          CSV
        </ReportActionButton>
      </ReportToolbar>

      <ReportSurface maxWidth="max-w-6xl">
        <div className="border-b border-white/10 pb-6 text-center">
          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70 print:block">Confidential</p>
          <h1 className="mt-3 text-2xl font-semibold uppercase tracking-[0.16em] text-white sm:text-3xl">{data.school.name}</h1>
          <p className="mt-2 text-sm text-slate-400">{data.school.location}</p>
          <h2 className="mt-4 text-lg font-semibold uppercase tracking-[0.18em] text-slate-100">School-Wide Exam Results</h2>
          {data.term.name ? <p className="mt-2 text-sm text-slate-400">{data.term.name}</p> : null}
        </div>

        <div className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/40 p-4 print:hidden">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter size={17} className="text-cyan-300" />
              <h3 className="font-semibold text-slate-100">Report filters</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setFilters({ term_id: '', department_id: '', course_id: '', subject_id: '' });
                setSearch('');
                setPerformance('all');
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5"
            >
              <RotateCcw size={13} />
              Reset
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={filters.term_id}
              onChange={(event) => setFilters((current) => ({ ...current, term_id: event.target.value }))}
              className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            >
              <option value="">Active term</option>
              {(data.filter_options?.terms ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select
              value={filters.department_id}
              onChange={(event) => setFilters((current) => ({
                ...current,
                department_id: event.target.value,
                course_id: '',
                subject_id: '',
              }))}
              className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            >
              <option value="">All departments</option>
              {(data.filter_options?.departments ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select
              value={filters.course_id}
              onChange={(event) => setFilters((current) => ({ ...current, course_id: event.target.value, subject_id: '' }))}
              className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            >
              <option value="">All courses</option>
              {availableCourses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select
              value={filters.subject_id}
              onChange={(event) => setFilters((current) => ({ ...current, subject_id: event.target.value }))}
              className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            >
              <option value="">All subjects</option>
              {availableSubjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search course, subject, or top student"
                className="w-full rounded-xl border border-white/10 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-200"
              />
            </div>
            <select
              value={performance}
              onChange={(event) => setPerformance(event.target.value)}
              className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            >
              <option value="all">All performance bands</option>
              <option value="strong">Strong (75%+)</option>
              <option value="watch">Watch (50–74.9%)</option>
              <option value="critical">Critical (&lt;50%)</option>
            </select>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ReportMetricCard
            label="School Average"
            value={`${data.summary.school_avg}%`}
            accent="cyan"
            helper={data.trend ? <><TrendBadge delta={data.trend.avg_delta} /> <span>vs {data.trend.prev_term}</span></> : undefined}
          />
          <ReportMetricCard
            label="Pass Rate"
            value={`${data.summary.pass_rate}%`}
            accent="emerald"
            helper={data.trend ? <><TrendBadge delta={data.trend.pass_rate_delta} /> <span>vs {data.trend.prev_term}</span></> : undefined}
          />
          <ReportMetricCard
            label="Top Course"
            value={data.summary.top_course ?? '—'}
            accent="violet"
            helper={`${data.summary.total_scores} recorded scores`}
          />
        </div>

        <div className="mt-6">
          <ReportSectionTitle>Performance by Course</ReportSectionTitle>
          <div className="overflow-x-auto rounded-[28px] border border-white/10">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-800/90 text-white">
                  <SortableTh label="Course" sortKey="course_name" sort={courseTable.sort} onSort={courseTable.setSort} className="px-3 py-3 text-left" />
                  <SortableTh label="Students" sortKey="student_count" sort={courseTable.sort} onSort={courseTable.setSort} className="px-3 py-3 text-center" />
                  <SortableTh label="Avg Marks" sortKey="avg_marks" sort={courseTable.sort} onSort={courseTable.setSort} className="px-3 py-3 text-center" />
                  <SortableTh label="Pass %" sortKey="pass_pct" sort={courseTable.sort} onSort={courseTable.setSort} className="px-3 py-3 text-center" />
                  <SortableTh label="Top Student" sortKey="top_student" sort={courseTable.sort} onSort={courseTable.setSort} className="px-3 py-3 text-left" />
                </tr>
              </thead>
              <tbody>
                {filteredCourses.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No data for this term</td></tr>
                ) : courseTable.paged.map((row, i) => (
                  <tr key={row.course_id} className={i % 2 === 0 ? 'bg-slate-950/40' : 'bg-white/[0.02]'}>
                    <td className="px-3 py-3 font-medium text-slate-100">{row.course_name}</td>
                    <td className="px-3 py-3 text-center text-slate-400">{row.student_count}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.avg_marks >= 75 ? 'bg-emerald-400/10 text-emerald-200' : row.avg_marks >= 50 ? 'bg-amber-400/10 text-amber-200' : 'bg-red-500/10 text-red-200'}`}>
                        {row.avg_marks}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center font-semibold text-emerald-300">{row.pass_pct}%</td>
                    <td className="px-3 py-3 text-xs text-slate-400">{row.top_student ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6">
          <ReportSectionTitle>Performance by Subject</ReportSectionTitle>
          <div className="overflow-x-auto rounded-[28px] border border-white/10">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-800/90 text-white">
                  <SortableTh label="Subject" sortKey="subject_name" sort={subjectTable.sort} onSort={subjectTable.setSort} className="px-3 py-3 text-left" />
                  <SortableTh label="Entries" sortKey="entries" sort={subjectTable.sort} onSort={subjectTable.setSort} className="px-3 py-3 text-center" />
                  <SortableTh label="Avg" sortKey="avg_marks" sort={subjectTable.sort} onSort={subjectTable.setSort} className="px-3 py-3 text-center" />
                  <SortableTh label="Pass %" sortKey="pass_pct" sort={subjectTable.sort} onSort={subjectTable.setSort} className="px-3 py-3 text-center" />
                  <SortableTh label="Fail %" sortKey="fail_pct" sort={subjectTable.sort} onSort={subjectTable.setSort} className="px-3 py-3 text-center" />
                </tr>
              </thead>
              <tbody>
                {filteredSubjects.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No data for this term</td></tr>
                ) : subjectTable.paged.map((row, i) => (
                  <tr key={row.subject_id} className={i % 2 === 0 ? 'bg-slate-950/40' : 'bg-white/[0.02]'}>
                    <td className="px-3 py-3 font-medium text-slate-100">{row.subject_name}</td>
                    <td className="px-3 py-3 text-center text-slate-400">{row.entries}</td>
                    <td className="px-3 py-3 text-center font-semibold text-slate-100">{row.avg_marks}%</td>
                    <td className="px-3 py-3 text-center font-semibold text-emerald-300">{row.pass_pct}%</td>
                    <td className="px-3 py-3 text-center font-semibold text-red-300">{row.fail_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-6 text-right text-xs text-slate-500">
          Generated by {data.generated_by} on {new Date(data.generated_at).toLocaleString()}
        </p>
      </ReportSurface>

      <ReportPrintStyles />
    </ReportPage>
  );
}
