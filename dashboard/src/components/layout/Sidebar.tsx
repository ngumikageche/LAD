import { Link, useLocation } from 'react-router-dom';
import {
  Book, Home, Users, BarChart, FileText, ChevronsLeft, ChevronsRight, Upload,
  Shield, Building2, School, KeyRound, UserCog, MessageSquare, TrendingUp,
  BarChart3, Bell, ClipboardList, CalendarCheck, Receipt, GraduationCap,
  BookOpen, UserCheck, ChevronDown, ChevronRight, Settings, LayoutDashboard,
  QrCode, ScanLine, PenLine, HeartPulse,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import theme from '../../theme/theme';

interface NavItem {
  name: string;
  icon: React.ElementType;
  path: string;
  color: string;
  permission?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const studentGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard',         icon: LayoutDashboard, path: '/student/dashboard',         color: 'text-blue-300' },
      { name: 'Notifications',     icon: Bell,            path: '/student/notifications',     color: 'text-amber-400'  },
      { name: 'My Profile',        icon: UserCog,         path: '/student/profile',           color: 'text-teal-300' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { name: 'My Scores',         icon: FileText,        path: '/student/scores',            color: 'text-blue-300'   },
      { name: 'My Subjects',       icon: Book,            path: '/student/subjects',          color: 'text-teal-300'},
      { name: 'Online Exams',      icon: ClipboardList,   path: '/student/online-exams',      color: 'text-indigo-300' },
      { name: 'Documents',         icon: BookOpen,        path: '/student/documents',         color: 'text-indigo-300' },
    ],
  },
    {
      label: 'Reports',
      items: [
        { name: 'All Reports',       icon: FileText,        path: '/reports',                   color: 'text-teal-300', permission: 'reports.*' },
        { name: 'Report Card',       icon: ClipboardList,   path: '/student/report-card',       color: 'text-blue-300', permission: 'reports.student.term' },
        { name: 'Practical Reports', icon: FileText,        path: '/student/practical-assessments', color: 'text-teal-300' },
        { name: 'Attendance',        icon: CalendarCheck,   path: '/student/attendance-report', color: 'text-green-400', permission: 'reports.student.attendance' },
        { name: 'Fee Statement',     icon: Receipt,         path: '/student/fee-statement',     color: 'text-amber-400', permission: 'reports.student.fees' },
      ],
  },
  {
    label: 'Attendance',
    items: [
      { name: 'Check In',          icon: ScanLine,        path: '/student/attendance/checkin', color: 'text-teal-300' },
    ],
  },
];

const trainerGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard',         icon: LayoutDashboard, path: '/trainer-hub',               color: 'text-blue-300' },
    ],
  },
  {
    label: 'Students',
    items: [
      { name: 'Student Profile',   icon: TrendingUp,      path: '/trainer/student-profile',   color: 'text-teal-300' },
      { name: 'Users',             icon: Shield,          path: '/users',                     color: 'text-red-400', permission: 'users.read' },
      { name: 'Provide Feedback',  icon: MessageSquare,   path: '/trainer/feedback',          color: 'text-amber-400'   },
      { name: 'Online Exams',      icon: ClipboardList,   path: '/trainer/online-exams',      color: 'text-indigo-300' },
      { name: 'Documents',         icon: BookOpen,        path: '/trainer/documents',         color: 'text-indigo-300' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { name: 'All Reports',       icon: FileText,        path: '/reports',                   color: 'text-teal-300', permission: 'reports.*' },
      { name: 'Trainer Reports',   icon: FileText,        path: '/trainer/reports',           color: 'text-blue-300', permission: 'reports.class.performance' },
      { name: 'Class Performance', icon: BarChart3,       path: '/trainer/class-performance', color: 'text-teal-300', permission: 'reports.class.performance' },
      { name: 'Disciplinary Records', icon: HeartPulse,   path: '/disciplinary-records',      color: 'text-rose-300', permission: 'reports.student.discipline' },
      { name: 'Practical Assess.', icon: FileText,        path: '/trainer/practical-assessments', color: 'text-teal-300' },
      { name: 'Syllabus Coverage', icon: BookOpen,        path: '/trainer/syllabus',          color: 'text-green-400', permission: 'reports.teacher.syllabus' },
      { name: 'My Attendance',     icon: UserCheck,       path: '/trainer/attendance',        color: 'text-amber-400', permission: 'reports.teacher.attendance' },
      { name: 'Manual Attendance',  icon: PenLine,         path: '/trainer/attendance/manual', color: 'text-orange-400' },
    ],
  },
  {
    label: 'Attendance',
    items: [
      { name: 'Take Attendance',   icon: QrCode,          path: '/trainer/attendance-session', color: 'text-teal-300' },
    ],
  },
];

const adminGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard',         icon: LayoutDashboard, path: '/admin/dashboard',            color: 'text-blue-300' },
      { name: 'Analytics',         icon: BarChart,        path: '/admin/analytics',            color: 'text-teal-300'    },
      { name: 'Notifications',     icon: Bell,            path: '/admin/notifications',        color: 'text-amber-400'    },
    ],
  },
  {
    label: 'People',
    items: [
      { name: 'Students',          icon: Users,           path: '/students',                   color: 'text-blue-300'   },
      { name: 'Trainers',          icon: UserCog,         path: '/trainers',                   color: 'text-teal-300'    },
      { name: 'Student Reports',   icon: FileText,        path: '/admin/student-reports',      color: 'text-indigo-300', permission: 'reports.student.write' },
      { name: 'Users',             icon: Shield,          path: '/users',                      color: 'text-red-400'   },
      { name: 'Roles',             icon: KeyRound,        path: '/roles',                      color: 'text-amber-400' },
    ],
  },
  {
    label: 'Institution',
    items: [
      { name: 'Institutions',      icon: Building2,       path: '/institutions',               color: 'text-blue-300'},
      { name: 'Departments',       icon: School,          path: '/departments',                color: 'text-teal-300'   },
      { name: 'Courses',           icon: Book,            path: '/courses',                    color: 'text-amber-400'  },
      { name: 'Modules',           icon: Book,            path: '/modules',                    color: 'text-blue-300' },
      { name: 'Subjects',          icon: Book,            path: '/subjects',                   color: 'text-amber-400'  },
    ],
  },
  {
    label: 'Academics',
    items: [
      { name: 'Score Management',  icon: FileText,        path: '/admin/scores',               color: 'text-red-400'    },
      { name: 'Bulk Upload Marks', icon: Upload,          path: '/admin/scores/bulk-upload',   color: 'text-amber-400'  },
      { name: 'Practical Assess.', icon: FileText,        path: '/admin/practical-assessments', color: 'text-teal-300' },
      { name: 'Online Exams',      icon: ClipboardList,   path: '/admin/online-exams',         color: 'text-indigo-300' },
      { name: 'Documents',          icon: BookOpen,        path: '/admin/documents',            color: 'text-teal-300'   },
      { name: 'Progress',          icon: BarChart,        path: '/progress',                   color: 'text-green-400'},
    ],
  },
  {
    label: 'Reports',
    items: [
      { name: 'Exam Results',      icon: GraduationCap,   path: '/admin/reports/exam-results', color: 'text-blue-300', permission: 'reports.admin.pass_rate' },
      { name: 'Fee Collection',    icon: Receipt,         path: '/admin/reports/fees',         color: 'text-green-400', permission: 'reports.admin.fees' },
      { name: 'Enrolment',         icon: ClipboardList,   path: '/admin/reports/enrolment',    color: 'text-amber-400', permission: 'reports.admin.enrolment' },
      { name: 'Disciplinary Records', icon: HeartPulse,   path: '/disciplinary-records',       color: 'text-rose-300', permission: 'reports.student.discipline' },
      { name: 'All Reports',       icon: FileText,        path: '/reports',                    color: 'text-teal-300', permission: 'reports.*' },
    ],
  },
  {
    label: 'Attendance',
    items: [
      { name: 'Take Attendance',   icon: QrCode,          path: '/trainer/attendance-session', color: 'text-teal-300' },
      { name: 'Manual Attendance',  icon: PenLine,         path: '/admin/attendance/manual',    color: 'text-orange-400' },
      { name: 'Attendance Report', icon: CalendarCheck,   path: '/admin/attendance',           color: 'text-green-400' },
    ],
  },
];

const groupsByType: Record<string, NavGroup[]> = {
  student: studentGroups,
  trainer: trainerGroups,
  admin:   adminGroups,
};

function hasNavPermission(user: ReturnType<typeof useAuth>['user'], permission?: string) {
  if (!permission) return true;
  if (!user) return false;
  if (user.user_type === 'admin' || user.permissions['*'] === true) return true;
  if (permission === 'reports.*') {
    return Object.keys(user.permissions).some((key) => key.startsWith('reports.') && user.permissions[key]);
  }
  return user.permissions[permission] === true || user.permissions[`${permission}.view`] === true;
}

function NavGroupSection({
  group,
  isCollapsed,
  location,
}: {
  group: NavGroup;
  isCollapsed: boolean;
  location: ReturnType<typeof useLocation>;
}) {
  const isAnyActive = group.items.some(
    (item) =>
      location.pathname === item.path ||
      location.pathname.startsWith(item.path + '/')
  );
  const [open, setOpen] = useState<boolean>(isAnyActive || true);

  if (isCollapsed) {
    return (
      <div className="mb-1">
        {group.items.map((item) => {
          const active =
            location.pathname === item.path ||
            location.pathname.startsWith(item.path + '/');
          return (
            <Link
              key={item.path}
              to={item.path}
              title={item.name}
              className={`flex items-center justify-center p-3 rounded-lg transition-all mb-0.5 ${
                active
                  ? 'bg-teal-500/15 border-l-2 border-teal-400'
                  : 'hover:bg-blue-800/70'
              }`}
            >
              <item.icon className={`h-5 w-5 ${item.color}`} />
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mb-2">
      {/* Group header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${theme.text.muted} hover:text-slate-200 ${theme.interactive.base}`}
      >
        <span>{group.label}</span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>

      {/* Items — linked-list style with a left border connector */}
      {open && (
        <ul className="relative ml-3 pl-3 border-l border-blue-800 space-y-0.5">
          {group.items.map((item) => {
            const active =
              location.pathname === item.path ||
              location.pathname.startsWith(item.path + '/');
            return (
              <li key={item.path} className="relative">
                {/* Connector tick */}
                <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-3 h-px bg-blue-800" />
                <Link
                  to={item.path}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all font-medium ${
                    active
                      ? 'bg-teal-500/15 text-teal-200 border-l-2 border-teal-400'
                      : 'text-slate-300 hover:bg-blue-800/70 hover:text-slate-100'
                  }`}
                >
                  <item.icon className={`h-4 w-4 shrink-0 ${active ? 'text-teal-300' : item.color}`} />
                  <span className="truncate">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  const groups = useMemo(() => {
    const baseGroups = groupsByType[user?.user_type ?? ''] ?? [];
    return baseGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => hasNavPermission(user, item.permission)),
      }))
      .filter((group) => group.items.length > 0);
  }, [user]);

  return (
    <div
      className={`${theme.layout.sidebar} border-r transition-all duration-300 flex flex-col ${
        isCollapsed ? 'w-16' : 'w-64'
      } shadow-2xl shadow-blue-950/30`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-blue-800 shrink-0">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-teal-400 rounded-full" />
            <h1 className="text-lg font-bold text-white">
              LAD
            </h1>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed((c) => !c)}
          className="p-2 rounded-md hover:bg-blue-800/70 text-slate-300 transition-all duration-200"
        >
          {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {groups.map((group) => (
          <NavGroupSection
            key={group.label}
            group={group}
            isCollapsed={isCollapsed}
            location={location}
          />
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;
