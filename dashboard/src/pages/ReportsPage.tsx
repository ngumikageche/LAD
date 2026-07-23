import { Link } from 'react-router-dom';
import type { ElementType } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  Download,
  FileText,
  GraduationCap,
  HeartPulse,
  Printer,
  Scale,
  ShieldAlert,
  Users,
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

export default function ReportsPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    academicYear: '',
    term: '',
    classId: '',
    subjectId: '',
    dateFrom: '',
    dateTo: '',
  });

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
    return accessibleReports.filter((report) => activeCategory === 'All' || report.category === activeCategory);
  }, [accessibleReports, activeCategory]);

  const exportSummary = (report: ReportCard) => {
    const rows = [
      ['Report', report.title],
      ['Category', report.category],
      ['Generated', new Date().toLocaleString()],
    ];
    const csv = rows.map((row) => row.map((cell) => JSON.stringify(cell)).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `${report.key}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-blue-950 px-4 py-6 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Reports</h1>
            <p className="mt-1 text-sm text-slate-400">Available reports are filtered by your role and permissions.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                  activeCategory === item
                    ? 'border-teal-400 bg-teal-500/15 text-teal-200'
                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ['Academic Year', 'academicYear'],
            ['Term', 'term'],
            ['Class', 'classId'],
            ['Subject', 'subjectId'],
            ['From', 'dateFrom'],
            ['To', 'dateTo'],
          ].map(([label, key]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">{label}</span>
              <input
                type={key === 'dateFrom' || key === 'dateTo' ? 'date' : 'text'}
                value={filters[key as keyof typeof filters]}
                onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-blue-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-400"
              />
            </label>
          ))}
        </div>

        {visibleReports.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
            No reports are available for your current role and permissions.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleReports.map((report) => {
              const Icon = report.icon;
              const printAllowed = canAct(user, report.permission, 'print');
              const exportAllowed = canAct(user, report.permission, 'export');

              return (
                <article key={report.key} className="rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-blue-950/20">
                  <div className="mb-4 flex items-start gap-3">
                    <div className="rounded-md border border-teal-500/30 bg-teal-500/10 p-2 text-teal-300">
                      <Icon size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold uppercase text-slate-500">{report.category}</div>
                      <h2 className="mt-1 text-lg font-semibold text-slate-100">{report.title}</h2>
                    </div>
                  </div>

                  <p className="min-h-12 text-sm leading-6 text-slate-400">{report.description}</p>
                  <div className="mt-4 text-xs text-slate-500">Last generated: On demand</div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      to={report.path}
                      className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                    >
                      <FileText size={16} /> View
                    </Link>
                    <button
                      type="button"
                      disabled={!printAllowed}
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Printer size={16} /> Print
                    </button>
                    <button
                      type="button"
                      disabled={!exportAllowed}
                      onClick={() => exportSummary(report)}
                      className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Download size={16} /> Export
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
