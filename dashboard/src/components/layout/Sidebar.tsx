import { Link, useLocation } from 'react-router-dom';
import { Book, Home, Users, BarChart, FileText, ChevronsLeft, ChevronsRight, Shield, Building2, School, KeyRound, UserCog, MessageSquare, TrendingUp, BarChart3, Bell } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';

const navItems = [
  { name: 'Dashboard', icon: Home, path: '/student/dashboard', color: 'text-indigo-600', userTypes: ['student'] },
  { name: 'Dashboard', icon: Home, path: '/trainer-hub', color: 'text-indigo-600', userTypes: ['trainer'] },
  { name: 'Dashboard', icon: Home, path: '/admin/dashboard', color: 'text-indigo-600', userTypes: ['admin'] },
  { name: 'My Scores', icon: FileText, path: '/student/scores', color: 'text-blue-600', userTypes: ['student'] },
  { name: 'My Subjects', icon: Book, path: '/student/subjects', color: 'text-emerald-600', userTypes: ['student'] },
  { name: 'Notifications', icon: Bell, path: '/student/notifications', color: 'text-amber-600', userTypes: ['student'] },
  { name: 'My Profile', icon: UserCog, path: '/student/profile', color: 'text-violet-600', userTypes: ['student'] },
  { name: 'Users', icon: Shield, path: '/users', color: 'text-rose-600', userTypes: ['admin'] },
  { name: 'Roles', icon: KeyRound, path: '/roles', color: 'text-orange-600', userTypes: ['admin'] },
  { name: 'Institutions', icon: Building2, path: '/institutions', color: 'text-emerald-600', userTypes: ['admin'] },
  { name: 'Departments', icon: School, path: '/departments', color: 'text-cyan-600', userTypes: ['admin'] },
  { name: 'Courses', icon: Book, path: '/courses', color: 'text-amber-600', userTypes: ['admin'] },
  { name: 'Students', icon: Users, path: '/students', color: 'text-blue-600', userTypes: ['admin'] },
  { name: 'Trainers', icon: UserCog, path: '/trainers', color: 'text-sky-600', userTypes: ['admin'] },
  { name: 'Trainer Reports', icon: FileText, path: '/trainer/reports', color: 'text-indigo-600', userTypes: ['trainer'] },
  { name: 'Provide Feedback', icon: MessageSquare, path: '/trainer/feedback', color: 'text-cyan-600', userTypes: ['trainer'] },
  { name: 'Student Profile', icon: TrendingUp, path: '/trainer/student-profile', color: 'text-purple-600', userTypes: ['trainer'] },
  { name: 'Analytics', icon: BarChart, path: '/admin/analytics', color: 'text-red-600', userTypes: ['admin'] },
  { name: 'Score Management', icon: FileText, path: '/admin/scores', color: 'text-red-600', userTypes: ['admin'] },
  { name: 'Notifications', icon: Bell, path: '/admin/notifications', color: 'text-red-600', userTypes: ['admin'] },
  { name: 'Modules', icon: Book, path: '/modules', color: 'text-indigo-600', userTypes: ['admin'] },
  { name: 'Subjects', icon: Book, path: '/subjects', color: 'text-amber-600', userTypes: ['admin'] },
  { name: 'Progress', icon: BarChart, path: '/progress', color: 'text-emerald-600', userTypes: ['admin'] },
  { name: 'Reports', icon: FileText, path: '/reports', color: 'text-purple-600', userTypes: ['admin'] },
];

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const items = useMemo(() => {
    const userType = user?.user_type;
    return navItems.filter((item) => {
      return item.userTypes.includes(userType || '');
    });
  }, [user]);

  return (
    <div className={`bg-white border-r border-gray-200 transition-all duration-300 flex flex-col ${isCollapsed ? 'w-20' : 'w-64'} shadow-sm`}>
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!isCollapsed && (
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">LAD</h1>
          </div>
        )}
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-2 rounded-md hover:bg-gray-100 transition-colors">
          {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </div>
      <nav className="mt-2 flex-1 px-2">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.name}>
              <Link
                to={item.path}
                className={`flex items-center px-3 py-3 rounded-lg transition-all duration-200 font-medium ${
                  location.pathname === item.path
                    ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
              <item.icon className={`h-5 w-5 ${item.color}`} />
                {!isCollapsed && <span className="ml-3">{item.name}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
