import { Link, useLocation } from 'react-router-dom';
import {
  Book, Home, Users, BarChart, FileText, ChevronsLeft, ChevronsRight,
  Shield, Building2, School, KeyRound, UserCog, MessageSquare, TrendingUp,
  BarChart3, Bell, ClipboardList, CalendarCheck, Receipt, GraduationCap,
  BookOpen, UserCheck, ChevronDown, ChevronRight, Settings, LayoutDashboard,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';

interface NavItem {
  name: string;
  icon: React.ElementType;
  path: string;
  color: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const studentGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard',         icon: LayoutDashboard, path: '/student/dashboard',         color: 'text-indigo-600' },
      { name: 'Notifications',     icon: Bell,            path: '/student/notifications',     color: 'text-amber-600'  },
      { name: 'My Profile',        icon: UserCog,         path: '/student/profile',           color: 'text-violet-600' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { name: 'My Scores',         icon: FileText,        path: '/student/scores',            color: 'text-blue-600'   },
      { name: 'My Subjects',       icon: Book,            path: '/student/subjects',          color: 'text-emerald-600'},
    ],
  },
  {
    label: 'Reports',
    items: [
      { name: 'Report Card',       icon: ClipboardList,   path: '/student/report-card',       color: 'text-blue-500'   },
      { name: 'Attendance',        icon: CalendarCheck,   path: '/student/attendance-report', color: 'text-green-600'  },
      { name: 'Fee Statement',     icon: Receipt,         path: '/student/fee-statement',     color: 'text-purple-600' },
    ],
  },
];

const trainerGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard',         icon: LayoutDashboard, path: '/trainer-hub',               color: 'text-indigo-600' },
    ],
  },
  {
    label: 'Students',
    items: [
      { name: 'Student Profile',   icon: TrendingUp,      path: '/trainer/student-profile',   color: 'text-purple-600' },
      { name: 'Provide Feedback',  icon: MessageSquare,   path: '/trainer/feedback',          color: 'text-cyan-600'   },
    ],
  },
  {
    label: 'Reports',
    items: [
      { name: 'Trainer Reports',   icon: FileText,        path: '/trainer/reports',           color: 'text-indigo-600' },
      { name: 'Class Performance', icon: BarChart3,       path: '/trainer/class-performance', color: 'text-blue-600'   },
      { name: 'Syllabus Coverage', icon: BookOpen,        path: '/trainer/syllabus',          color: 'text-green-600'  },
      { name: 'My Attendance',     icon: UserCheck,       path: '/trainer/attendance',        color: 'text-amber-600'  },
    ],
  },
];

const adminGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard',         icon: LayoutDashboard, path: '/admin/dashboard',            color: 'text-indigo-600' },
      { name: 'Analytics',         icon: BarChart,        path: '/admin/analytics',            color: 'text-red-600'    },
      { name: 'Notifications',     icon: Bell,            path: '/admin/notifications',        color: 'text-red-600'    },
    ],
  },
  {
    label: 'People',
    items: [
      { name: 'Students',          icon: Users,           path: '/students',                   color: 'text-blue-600'   },
      { name: 'Trainers',          icon: UserCog,         path: '/trainers',                   color: 'text-sky-600'    },
      { name: 'Users',             icon: Shield,          path: '/users',                      color: 'text-rose-600'   },
      { name: 'Roles',             icon: KeyRound,        path: '/roles',                      color: 'text-orange-600' },
    ],
  },
  {
    label: 'Institution',
    items: [
      { name: 'Institutions',      icon: Building2,       path: '/institutions',               color: 'text-emerald-600'},
      { name: 'Departments',       icon: School,          path: '/departments',                color: 'text-cyan-600'   },
      { name: 'Courses',           icon: Book,            path: '/courses',                    color: 'text-amber-600'  },
      { name: 'Modules',           icon: Book,            path: '/modules',                    color: 'text-indigo-600' },
      { name: 'Subjects',          icon: Book,            path: '/subjects',                   color: 'text-amber-600'  },
    ],
  },
  {
    label: 'Academics',
    items: [
      { name: 'Score Management',  icon: FileText,        path: '/admin/scores',               color: 'text-red-600'    },
      { name: 'Progress',          icon: BarChart,        path: '/progress',                   color: 'text-emerald-600'},
    ],
  },
  {
    label: 'Reports',
    items: [
      { name: 'Exam Results',      icon: GraduationCap,   path: '/admin/reports/exam-results', color: 'text-indigo-600' },
      { name: 'Fee Collection',    icon: Receipt,         path: '/admin/reports/fees',         color: 'text-green-600'  },
      { name: 'Enrolment',         icon: ClipboardList,   path: '/admin/reports/enrolment',    color: 'text-purple-600' },
      { name: 'All Reports',       icon: FileText,        path: '/reports',                    color: 'text-purple-600' },
    ],
  },
];

const groupsByType: Record<string, NavGroup[]> = {
  student: studentGroups,
  trainer: trainerGroups,
  admin:   adminGroups,
};

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
  const [open, setOpen] = useState(isAnyActive || true);

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
                  ? 'bg-indigo-50 border-l-2 border-indigo-600'
                  : 'hover:bg-gray-50'
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
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
      >
        <span>{group.label}</span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>

      {/* Items — linked-list style with a left border connector */}
      {open && (
        <ul className="relative ml-3 pl-3 border-l border-gray-200 space-y-0.5">
          {group.items.map((item) => {
            const active =
              location.pathname === item.path ||
              location.pathname.startsWith(item.path + '/');
            return (
              <li key={item.path} className="relative">
                {/* Connector tick */}
                <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-3 h-px bg-gray-200" />
                <Link
                  to={item.path}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all font-medium ${
                    active
                      ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <item.icon className={`h-4 w-4 shrink-0 ${active ? 'text-indigo-600' : item.color}`} />
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

  const groups = useMemo(
    () => groupsByType[user?.user_type ?? ''] ?? [],
    [user]
  );

  return (
    <div
      className={`bg-white border-r border-gray-200 transition-all duration-300 flex flex-col ${
        isCollapsed ? 'w-16' : 'w-64'
      } shadow-sm`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-600 rounded-full" />
            <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
              LAD
            </h1>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed((c) => !c)}
          className="p-2 rounded-md hover:bg-gray-100 transition-colors"
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
