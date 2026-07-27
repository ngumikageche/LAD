import { Link } from 'react-router-dom';
import type { ElementType, ReactNode } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  ChevronRight,
  Download,
  FileText,
  Filter,
  GraduationCap,
  HeartPulse,
  Printer,
  Scale,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

type ReportCard = {
  key: string;
  title: string;
  description: string;
  category: 'Academic' | 'Attendance' | 'Behaviour' | 'Finance' | 'Compliance' | 'Teacher';
  permission: string;
  path: string;
  icon: ElementType;
  roles: string[];
};

const reportCards: ReportCard[] = [
  {
    key: 'student-report-card',
    title: 'Term Result Report',
    description: 'Subject scores, grade outcomes, attendance summary, and remarks.',
    category: 'Academic',
    permission: 'reports.student.term',
    path: '/student/report-card',
    icon: GraduationCap,
    roles: ['student'],
  },
  {
    key: 'student-attendance',
    title: 'Student Attendance',
    description: 'Present, absent, and late records across the selected period.',
    category: 'Attendance',
    permission: 'reports.student.attendance',
    path: '/student/attendance-report',
    icon: CalendarCheck,
    roles: ['student'],
  },
  {
    key: 'class-performance',
    title: 'Class Performance',
    description: 'Class averages, pass rates, ranking, and grade distribution.',
    category: 'Academic',
    permission: 'reports.class.performance',
    path: '/trainer/class-performance',
    icon: BarChart3,
    roles: ['trainer'],
  },
  {
    key: 'syllabus-coverage',
    title: 'Syllabus Coverage',
    description: 'Planned and covered topics with completion percentage.',
    category: 'Teacher',
    permission: 'reports.teacher.syllabus',
    path: '/trainer/syllabus',
    icon: BookOpen,
    roles: ['trainer'],
  },
  {
    key: 'teacher-attendance',
    title: 'My Attendance',
    description: 'Trainer attendance records, leave days, and attendance rate.',
    category: 'Attendance',
    permission: 'reports.teacher.attendance',
    path: '/trainer/attendance',
    icon: CalendarCheck,
    roles: ['trainer'],
  },
  {
    key: 'exam-results',
    title: 'School Pass Rate',
    description: 'School-wide result trends by course and subject.',
    category: 'Academic',
    permission: 'reports.admin.pass_rate',
    path: '/admin/reports/exam-results',
    icon: GraduationCap,
    roles: ['admin'],
  },
  {
    key: 'enrolment',
    title: 'Enrolment Statistics',
    description: 'Learner counts by course with attendance risk flags.',
    category: 'Academic',
    permission: 'reports.admin.enrolment',
    path: '/admin/reports/enrolment',
    icon: Users,
    roles: ['admin'],
  },
  {
    key: 'safeguarding',
    title: 'Safeguarding Log',
    description: 'Restricted safeguarding summary for authorized administrators.',
    category: 'Compliance',
    permission: 'reports.admin.safeguarding',
    path: '/reports/admin/safeguarding',
    icon: ShieldAlert,
    roles: ['admin'],
  },
  {
    key: 'compliance',
    title: 'Compliance Report',
    description: 'Regulatory and accreditation report shell for available evidence.',
    category: 'Compliance',
    permission: 'reports.admin.compliance',
    path: '/reports/admin/compliance',
    icon: Scale,
    roles: ['admin'],
  },
  {
    key: 'behaviour',
    title: 'Disciplinary Record',
    description: 'Behaviour and discipline report where records are configured.',
    category: 'Behaviour',
    permission: 'reports.student.discipline',
    path: '/disciplinary-records',
    icon: HeartPulse,
    roles: ['admin', 'trainer'],
  },
];

function hasReportPermission(user: ReturnType<typeof useAuth>['user'], permission: string) {
  if (!user) return false;
  if (user.user_type === 'admin' || user.permissions['*'] === true) return true;
  return user.permissions[permission] === true || user.permissions[`${permission}.view`] === true;
}

function canAct(user: ReturnType<typeof useAuth>['user'], permission: string, action: 'print' | 'export') {
  if (!user) return false;
  if (user.user_type === 'admin' || user.permissions['*'] === true) return true;
  return user.permissions[permission] === true || user.permissions[`${permission}.${action}`] === true;
}

const EMPTY_FILTERS = {
  academicYear: '',
  term: '',
  classId: '',
  subjectId: '',
  dateFrom: '',
  dateTo: '',
};

export default function ReportsPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'recommended' | 'title-asc' | 'title-desc' | 'category'>('recommended');
  const [showFilters, setShowFilters] = useState(true);
  const [customReportKey, setCustomReportKey] = useState('');

  const accessibleReports = useMemo(() => {
    return reportCards.filter((report) => {
      if (!user) return false;
      return report.roles.includes(user.user_type) && hasReportPermission(user, report.permission);
    });
  }, [user]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(accessibleReports.map((report) => report.category)))],
    [accessibleReports],
  );
  const [category, setCategory] = useState('All');
  const activeCategory = categories.includes(category) ? category : 'All';

  const visibleReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = accessibleReports.filter((report) => (
      (activeCategory === 'All' || report.category === activeCategory)
      && (
        !query
        || report.title.toLowerCase().includes(query)
        || report.description.toLowerCase().includes(query)
        || report.category.toLowerCase().includes(query)
      )
    ));
    return [...filtered].sort((left, right) => {
      if (sortBy === 'title-asc') return left.title.localeCompare(right.title);
      if (sortBy === 'title-desc') return right.title.localeCompare(left.title);
      if (sortBy === 'category') {
        return left.category.localeCompare(right.category) || left.title.localeCompare(right.title);
      }
      return reportCards.findIndex((report) => report.key === left.key)
        - reportCards.findIndex((report) => report.key === right.key);
    });
  }, [accessibleReports, activeCategory, search, sortBy]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const selectedCustomReport = accessibleReports.find((report) => report.key === customReportKey)
    ?? visibleReports[0]
    ?? accessibleReports[0]
    ?? null;
  const currentYear = new Date().getFullYear();
  const academicYears = Array.from({ length: 6 }, (_, index) => {
    const endYear = currentYear + 1 - index;
    return `${endYear - 1}/${endYear}`;
  });

  const reportPath = (report: ReportCard) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return `${report.path}${params.size ? `?${params.toString()}` : ''}`;
  };

  const exportSummary = (report: ReportCard) => {
    const rows = [
      ['Report', report.title],
      ['Category', report.category],
      ['Generated', new Date().toLocaleString()],
      ['Academic year', filters.academicYear || 'All'],
      ['Term', filters.term || 'All'],
      ['Class', filters.classId || 'All'],
      ['Subject', filters.subjectId || 'All'],
      ['Date from', filters.dateFrom || 'Not set'],
      ['Date to', filters.dateTo || 'Not set'],
    ];
    const csv = rows.map((row) => row.map((cell) => JSON.stringify(cell)).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `${report.key}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen px-4 py-6 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="relative overflow-hidden rounded-[2rem] border border-teal-500/20 bg-[#0b1720] p-6 shadow-2xl shadow-slate-950/30 sm:p-8">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/20 bg-teal-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-teal-200">
                <Sparkles size={13} />
                Reporting centre
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">Reports</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Available reports are filtered by your role and permissions. Apply parameters once and carry them into any report.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/5 bg-white/[0.04] px-5 py-3">
                <p className="text-2xl font-black text-white">{accessibleReports.length}</p>
                <p className="text-xs text-slate-500">Available reports</p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.04] px-5 py-3">
                <p className="text-2xl font-black text-teal-300">{activeFilterCount}</p>
                <p className="text-xs text-slate-500">Active filters</p>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/80 p-5 shadow-xl shadow-slate-950/20 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
                    activeCategory === item
                      ? 'border-teal-400/40 bg-teal-400/15 text-teal-200 shadow-sm'
                      : 'border-slate-700 bg-slate-950/60 text-slate-400 hover:border-slate-600 hover:text-white'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search reports"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none focus:border-teal-400"
                />
              </label>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                aria-label="Sort reports"
                className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-teal-400"
              >
                <option value="recommended">Recommended order</option>
                <option value="title-asc">Title A–Z</option>
                <option value="title-desc">Title Z–A</option>
                <option value="category">Category</option>
              </select>
              <button
                type="button"
                onClick={() => setShowFilters((current) => !current)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:border-slate-600 hover:text-white"
              >
                <Filter size={16} />
                Filters
                {activeFilterCount > 0 ? <span className="rounded-full bg-teal-400 px-2 py-0.5 text-[10px] text-slate-950">{activeFilterCount}</span> : null}
              </button>
            </div>
          </div>

          {showFilters ? (
            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-teal-300" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-200">Report parameters</h2>
                    <p className="text-xs text-slate-500">These filters will be applied when you open or export a report.</p>
                  </div>
                </div>
                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white"
                  >
                    <X size={13} />
                    Clear all
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <ReportFilter label="Academic Year">
                  <select value={filters.academicYear} onChange={(event) => setFilters((current) => ({ ...current, academicYear: event.target.value }))}>
                    <option value="">All years</option>
                    {academicYears.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </ReportFilter>
                <ReportFilter label="Term">
                  <select value={filters.term} onChange={(event) => setFilters((current) => ({ ...current, term: event.target.value }))}>
                    <option value="">All terms</option>
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                  </select>
                </ReportFilter>
                <ReportFilter label="Class / Cohort">
                  <input value={filters.classId} onChange={(event) => setFilters((current) => ({ ...current, classId: event.target.value }))} placeholder="All classes" />
                </ReportFilter>
                <ReportFilter label="Subject / Unit">
                  <input value={filters.subjectId} onChange={(event) => setFilters((current) => ({ ...current, subjectId: event.target.value }))} placeholder="All subjects" />
                </ReportFilter>
                <ReportFilter label="From">
                  <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
                </ReportFilter>
                <ReportFilter label="To">
                  <input type="date" min={filters.dateFrom || undefined} value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
                </ReportFilter>
              </div>
            </div>
          ) : null}
        </section>

        {selectedCustomReport ? (
          <section className="flex flex-col gap-5 rounded-[2rem] border border-teal-500/20 bg-teal-500/[0.06] p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">Custom report</p>
              <h2 className="mt-1 text-xl font-black text-white">Build with your selected filters</h2>
              <p className="mt-1 text-sm text-slate-400">Choose a template, then open it with the academic year, cohort, subject and date parameters above.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:min-w-[500px]">
              <select
                value={selectedCustomReport.key}
                onChange={(event) => setCustomReportKey(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none focus:border-teal-400"
              >
                {accessibleReports.map((report) => <option key={report.key} value={report.key}>{report.title}</option>)}
              </select>
              <Link
                to={reportPath(selectedCustomReport)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-300"
              >
                Open custom report
                <ChevronRight size={16} />
              </Link>
            </div>
          </section>
        ) : null}

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white">{activeCategory} reports</h2>
            <p className="mt-1 text-sm text-slate-500">{visibleReports.length} report{visibleReports.length === 1 ? '' : 's'} found</p>
          </div>
        </div>

        {visibleReports.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-700 bg-slate-900/60 p-12 text-center">
            <Search size={28} className="mx-auto text-slate-600" />
            <p className="mt-3 font-bold text-slate-300">No reports match this view</p>
            <p className="mt-1 text-sm text-slate-500">Change the category or search phrase. Role permissions still determine availability.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleReports.map((report) => {
              const Icon = report.icon;
              const printAllowed = canAct(user, report.permission, 'print');
              const exportAllowed = canAct(user, report.permission, 'export');

              return (
                <article key={report.key} className="group flex flex-col rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-lg shadow-slate-950/20 transition hover:-translate-y-1 hover:border-teal-500/25 hover:shadow-xl">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl border border-teal-500/20 bg-teal-500/10 p-3 text-teal-300">
                      <Icon size={23} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{report.category}</div>
                      <h3 className="mt-1 text-lg font-black text-slate-100">{report.title}</h3>
                    </div>
                  </div>

                  <p className="mt-4 flex-1 text-sm leading-6 text-slate-400">{report.description}</p>
                  {activeFilterCount > 0 ? (
                    <div className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-teal-400/10 px-3 py-1 text-[11px] font-semibold text-teal-200">
                      <Filter size={11} />
                      {activeFilterCount} parameter{activeFilterCount === 1 ? '' : 's'} applied
                    </div>
                  ) : (
                    <div className="mt-4 text-xs text-slate-600">Generated on demand</div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
                    <Link
                      to={reportPath(report)}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-400 px-3 py-2.5 text-sm font-black text-slate-950 transition hover:bg-teal-300"
                    >
                      <FileText size={16} /> View report
                    </Link>
                    <button
                      type="button"
                      title={printAllowed ? 'Print report' : 'Print permission required'}
                      disabled={!printAllowed}
                      onClick={() => window.print()}
                      className="rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <Printer size={16} />
                    </button>
                    <button
                      type="button"
                      title={exportAllowed ? 'Export report summary' : 'Export permission required'}
                      disabled={!exportAllowed}
                      onClick={() => exportSummary(report)}
                      className="rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportFilter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="[&>input]:w-full [&>input]:rounded-xl [&>input]:border [&>input]:border-slate-700 [&>input]:bg-slate-900 [&>input]:px-3 [&>input]:py-2.5 [&>input]:text-sm [&>input]:text-slate-100 [&>input]:outline-none [&>input]:focus:border-teal-400 [&>select]:w-full [&>select]:rounded-xl [&>select]:border [&>select]:border-slate-700 [&>select]:bg-slate-900 [&>select]:px-3 [&>select]:py-2.5 [&>select]:text-sm [&>select]:text-slate-100 [&>select]:outline-none [&>select]:focus:border-teal-400">
        {children}
      </div>
    </label>
  );
}
